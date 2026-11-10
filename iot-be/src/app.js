import { dailyRange, getVirtualAlertState, getVirtualAlertDaily } from './mqtt/virtual-alerts.handler.js'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import swaggerUi from 'swagger-ui-express'
import {
  env
} from './config/env.js'
import {
  db
} from './config/database.js'
import {
  sendDeviceCommand
} from './mqtt/mqtt.client.js'
import {
  emit
} from './websocket/socket.js'
import {
  events
} from './websocket/events.js'
import openapi from './openapi.js'
import { canControlDevices, createAuthToken, isAdmin, verifyAuthToken } from './auth.js'

const app = express()
app.use(cors({
  origin: env.clientUrl
}))
app.use(express.json())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi))

function handleError(res, error) {
  console.error(error)
  return res.status(error.status || 500).json({
    error: error.message || 'Lỗi máy chủ.'
  })
}

async function authenticate(req, res, next) {
  const token = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1]
  const claims = verifyAuthToken(token)
  if (!claims) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' })

  try {
    const [users] = await db.execute(
      'SELECT id, username, fullName, role FROM `User` WHERE id = ?',
      [claims.sub],
    )
    if (!users[0]) return res.status(401).json({ error: 'Tài khoản không còn tồn tại.' })
    req.user = users[0]
    return next()
  } catch (error) {
    return handleError(res, error)
  }
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới được thay đổi phân quyền.' })
  }
  return next()
}

function requireDeviceControl(req, res, next) {
  if (!canControlDevices(req.user?.role)) {
    return res.status(403).json({ error: 'Tài khoản của bạn chỉ có quyền xem, chưa được phép điều khiển thiết bị.' })
  }
  return next()
}

function publicUser(user) {
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role }
}

function toSqlDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]} ${match[4]}` : value
}

app.get('/', (req, res) => res.json({
  ok: true,
  service: 'iot-be',
  health: '/api/health',
  api: '/api',
  docs: '/api-docs'
}))
app.get('/api', (req, res) => res.json({
  ok: true,
  endpoints: ['/api/health', '/api/auth/register', '/api/auth/login', '/api/auth/me', '/api/users', '/api/users/:id/role', '/api/profile/:id', '/api/dashboard', '/api/sensor-data', '/api/devices/:id/status', '/api/activity-history', '/api/virtual-alerts', '/api/virtual-alerts/daily'],
}))

app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1')
    return res.json({
      ok: true,
      database: 'connected'
    })
  } catch (error) {
    return handleError(res, error)
  }
})

app.post('/api/auth/register', async (req, res) => {
  let connection
  let lockAcquired = false
  try {
    let {
      username,
      password,
      fullName
    } = req.body || {}
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password ||
        typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({
        error: 'username, password và fullName là bắt buộc.'
      })
    }
    if (password.length < 6) return res.status(400).json({
      error: 'Mật khẩu cần ít nhất 6 ký tự.'
    })
    username = username.trim()
    fullName = fullName.trim()

    connection = await db.getConnection()
    const [lockRows] = await connection.query("SELECT GET_LOCK('smart_room_auth_register', 5) AS acquired")
    lockAcquired = Number(lockRows[0]?.acquired) === 1
    if (!lockAcquired) return res.status(503).json({ error: 'Không thể tạo tài khoản lúc này. Vui lòng thử lại.' })

    const [users] = await connection.execute('SELECT id FROM `User` WHERE username = ?', [username])
    if (users.length) return res.status(409).json({
      error: 'Tên người dùng đã tồn tại.'
    })

    const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM `User`')
    const role = Number(count.total) === 0 ? 'admin' : 'viewer'
    const [result] = await connection.execute(
      'INSERT INTO `User` (username, password, fullName, role) VALUES (?, ?, ?, ?)',
      [username, await bcrypt.hash(password, 10), fullName, role],
    )
    const [created] = await connection.execute('SELECT id, username, fullName, role FROM `User` WHERE id = ?', [result.insertId])
    return res.status(201).json(publicUser(created[0]))
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({
      error: 'Tên người dùng đã tồn tại.'
    })
    return handleError(res, error)
  } finally {
    if (connection) {
      if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('smart_room_auth_register')").catch(() => {})
      connection.release()
    }
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const {
      username,
      password
    } = req.body || {}
    if (!username || !password) return res.status(400).json({
      error: 'username và password là bắt buộc.'
    })

    const [users] = await db.execute('SELECT id, username, password, fullName, role FROM `User` WHERE username = ?', [username])
    const user = users[0]
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: 'Tên đăng nhập hoặc mật khẩu không đúng.'
      })
    }
    if (Number(user.id) === env.defaultUserId) {
      const [admins] = await db.execute("SELECT id FROM `User` WHERE LOWER(role) IN ('admin', 'quản trị viên') LIMIT 1")
      if (!admins.length) {
        await db.execute("UPDATE `User` SET role = 'admin' WHERE id = ?", [user.id])
        user.role = 'admin'
      }
    }
    return res.json({ token: createAuthToken(user.id), user: publicUser(user) })
  } catch (error) {
    return handleError(res, error)
  }
})

app.get('/api/auth/me', authenticate, (req, res) => res.json(publicUser(req.user)))

app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const [users] = await db.execute('SELECT id, username, fullName, role FROM `User` ORDER BY id')
    return res.json(users)
  } catch (error) {
    return handleError(res, error)
  }
})

app.patch('/api/users/:id/role', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const role = String(req.body?.role || '').trim().toLowerCase()
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID người dùng không hợp lệ.' })
    if (!['admin', 'operator', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Vai trò phải là admin, operator hoặc viewer.' })
    }

    const [users] = await db.execute('SELECT id, username, fullName, role FROM `User` WHERE id = ?', [id])
    const target = users[0]
    if (!target) return res.status(404).json({ error: 'Không tìm thấy người dùng.' })
    if (isAdmin(target.role) && role !== 'admin') {
      const [rows] = await db.execute("SELECT COUNT(*) AS total FROM `User` WHERE LOWER(role) IN ('admin', 'quản trị viên')")
      if (Number(rows[0].total) <= 1) {
        return res.status(409).json({ error: 'Hãy cấp quyền quản trị cho người khác trước khi hạ quyền quản trị viên cuối cùng.' })
      }
    }

    await db.execute('UPDATE `User` SET role = ? WHERE id = ?', [role, id])
    return res.json({ ...publicUser(target), role })
  } catch (error) {
    return handleError(res, error)
  }
})

app.get('/api/profile/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID người dùng không hợp lệ.' })
    const [users] = await db.execute(
      'SELECT id, username, fullName, student_id, `class`, email, phone, github, figma, report, postman, role FROM `User` WHERE id = ?',
      [id],
    )
    if (!users[0]) return res.status(404).json({
      error: 'Không tìm thấy người dùng.'
    })
    return res.json(users[0])
  } catch (error) {
    return handleError(res, error)
  }
})

app.put('/api/profile/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID người dùng không hợp lệ.' })
    const fields = 'id, username, fullName, student_id, `class`, email, phone, github, figma, report, postman, role'
    const [users] = await db.execute(`SELECT ${fields} FROM \`User\` WHERE id = ?`, [id])
    const current = users[0]
    if (!current) return res.status(404).json({
      error: 'Không tìm thấy người dùng.'
    })

    const body = req.body || {}
    const values = [
      body.fullName === undefined ? current.fullName : body.fullName,
      body.student_id === undefined ? current.student_id : body.student_id,
      body.class === undefined ? current.class : body.class,
      body.email === undefined ? current.email : body.email,
      body.phone === undefined ? current.phone : body.phone,
      body.github === undefined ? current.github : body.github,
      body.figma === undefined ? current.figma : body.figma,
      body.report === undefined ? current.report : body.report,
      body.postman === undefined ? current.postman : body.postman,
      id,
    ]
    await db.execute(
      'UPDATE `User` SET fullName = ?, student_id = ?, `class` = ?, email = ?, phone = ?, github = ?, figma = ?, report = ?, postman = ? WHERE id = ?',
      values,
    )
    const [updated] = await db.execute(`SELECT ${fields} FROM \`User\` WHERE id = ?`, [id])
    return res.json(updated[0])
  } catch (error) {
    return handleError(res, error)
  }
})

app.get('/api/dashboard', async (req, res) => {
  try {
    const [
      [sensors],
      [series],
      [devices]
    ] = await Promise.all([
      db.query(`SELECT s.id, s.name, s.unit, d.value, d.recorded_at
        FROM Sensor s LEFT JOIN DataSensor d ON d.id = (
          SELECT MAX(d2.id) FROM DataSensor d2 WHERE d2.sensor_id = s.id
        ) ORDER BY s.id`),
      db.query(`SELECT s.id AS sensor_id, s.name, s.unit, d.value, d.recorded_at
        FROM DataSensor d JOIN Sensor s ON s.id = d.sensor_id
        WHERE d.recorded_at >= NOW() - INTERVAL 6 HOUR ORDER BY d.recorded_at`),
      db.query('SELECT id, name, status FROM Device ORDER BY id'),
    ])
    return res.json({
      sensors,
      series,
      devices
    })
  } catch (error) {
    return handleError(res, error)
  }
})

app.get('/api/sensor-data', async (req, res) => {
  try {
    const {
      q = '', by = 'all', sort = 'newest'
    } = req.query
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
    const sensorNames = {
      light: 'Cảm biến ánh sáng',
      humidity: 'DHT11 - Độ ẩm',
      temperature: 'DHT11 - Nhiệt độ',
    }
    if (!['all', 'time', ...Object.keys(sensorNames)].includes(by)) {
      return res.status(400).json({ error: 'Tiêu chí tìm kiếm cảm biến không hợp lệ.' })
    }
    const where = []
    const values = []
    if (Object.hasOwn(sensorNames, by)) {
      where.push('s.name = ?')
      values.push(sensorNames[by])
    }
    if (q) {
      if (by === 'all') {
        where.push("(CAST(d.id AS CHAR) LIKE ? OR CONCAT(d.value, ' ', s.unit) LIKE ? OR s.name LIKE ? OR DATE_FORMAT(d.recorded_at, '%d/%m/%Y %H:%i:%s') LIKE ?)")
        values.push(...Array(4).fill(`%${q}%`))
      } else {
        where.push(by === 'time'
          ? "DATE_FORMAT(d.recorded_at, '%d/%m/%Y %H:%i:%s') LIKE ?"
          : "CONCAT(d.value, ' ', s.unit) LIKE ?")
        values.push(`%${q}%`)
      }
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const order = sort === 'oldest' ? 'ASC' : 'DESC'
    const [
      [count]
    ] = await db.execute(
      `SELECT COUNT(*) AS total FROM DataSensor d JOIN Sensor s ON s.id = d.sensor_id ${clause}`,
      values,
    )
    const [data] = await db.execute(
      `SELECT d.id, CONCAT(d.value, ' ', s.unit) AS value,
        DATE_FORMAT(d.recorded_at, '%d/%m/%Y %H:%i:%s') AS time, s.name AS device
       FROM DataSensor d JOIN Sensor s ON s.id = d.sensor_id ${clause}
       ORDER BY d.recorded_at ${order}, d.id ${order} LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    )
    return res.json({
      data,
      page,
      limit,
      total: count.total
    })
  } catch (error) {
    return handleError(res, error)
  }
})

app.post('/api/sensor-data', async (req, res) => {
  try {
    const {
      sensor_id,
      value,
      recorded_at
    } = req.body || {}
    if (sensor_id == null || !Number.isInteger(Number(sensor_id)) || Number(sensor_id) < 1 ||
      value == null || value === '' || !Number.isFinite(Number(value))) {
      return res.status(400).json({
        error: 'sensor_id và value là bắt buộc; value phải là số.'
      })
    }
    const [result] = await db.execute(
      'INSERT INTO DataSensor (sensor_id, value, recorded_at) VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))',
      [Number(sensor_id), Number(value), recorded_at || null],
    )
    const [rows] = await db.execute(
      `SELECT d.id, d.value, s.unit, d.recorded_at, s.name AS sensor
       FROM DataSensor d JOIN Sensor s ON s.id = d.sensor_id WHERE d.id = ?`,
      [result.insertId],
    )
    emit(events.sensor, rows[0])
    return res.status(201).json(rows[0])
  } catch (error) {
    return handleError(res, error)
  }
})

app.patch('/api/devices/:id/status', authenticate, requireDeviceControl, async (req, res) => {
  let connection
  let historyId
  let historyCompleted = false
  try {
    const id = Number(req.params.id)
    if (![1, 2, 3].includes(id)) return res.status(400).json({
      error: 'Chỉ hỗ trợ điều khiển từng thiết bị (ID 1–3).'
    })
    const status = String((req.body && req.body.status) || '').toUpperCase()
    if (!['ON', 'OFF'].includes(status)) return res.status(400).json({
      error: 'status chỉ nhận ON hoặc OFF.'
    })

    const [devices] = await db.execute('SELECT id FROM Device WHERE id = ?', [id])
    if (!devices[0]) return res.status(404).json({
      error: 'Không tìm thấy thiết bị.'
    })
    const [history] = await db.execute(
      `INSERT INTO ActionHistory (user_id, device_id, action, status)
       VALUES (?, ?, ?, 'LOADING')`,
      [req.user.id, id, status === 'ON' ? 'BẬT' : 'TẮT'],
    )
    historyId = history.insertId
    emit(events.activity, { id: historyId, status: 'LOADING' })
    const response = await sendDeviceCommand(id, status === 'ON')
    const actualStatus = response.actualState ? 'ON' : 'OFF'

    connection = await db.getConnection()
    await connection.beginTransaction()
    await connection.execute('UPDATE Device SET status = ? WHERE id = ?', [actualStatus, id])
    await connection.execute(
      "UPDATE ActionHistory SET status = 'THÀNH CÔNG' WHERE id = ?",
      [historyId],
    )
    await connection.commit()
    historyCompleted = true
    emit(events.activity, { id: historyId, status: 'THÀNH CÔNG' })
    const [updated] = await connection.execute('SELECT id, name, status FROM Device WHERE id = ?', [id])
    emit(events.device, updated[0])
    return res.json(updated[0])
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {})
    if (historyId && !historyCompleted) {
      try {
        await db.execute(
          "UPDATE ActionHistory SET status = 'THẤT BẠI' WHERE id = ? AND status = 'LOADING'",
          [historyId],
        )
        emit(events.activity, { id: historyId, status: 'THẤT BẠI' })
      } catch (historyError) {
        console.error('Không thể ghi lịch sử thao tác thất bại:', historyError)
      }
    }
    return handleError(res, error)
  } finally {
    if (connection) connection.release()
  }
})

app.get('/api/activity-history', async (req, res) => {
  try {
    const where = []
    const values = []
    for (const [key, sql] of Object.entries({
        device: 'd.name = ?',
        action: 'a.action = ?',
        status: 'a.status = ?'
      })) {
      if (req.query[key]) {
        where.push(sql);
        values.push(req.query[key])
      }
    }
    if (req.query.user) {
      where.push('(u.username LIKE ? OR u.fullName LIKE ?)')
      values.push(`%${req.query.user}%`, `%${req.query.user}%`)
    }
    if (req.query.from) {
      where.push('a.recorded_at >= ?');
      values.push(toSqlDate(req.query.from))
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const order = req.query.sort === 'oldest' ? 'ASC' : 'DESC'
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
    const page = Math.max(1, Number(req.query.page) || 1)
    const [
      [count]
    ] = await db.execute(
      `SELECT COUNT(*) AS total FROM ActionHistory a JOIN Device d ON d.id = a.device_id
       LEFT JOIN \`User\` u ON u.id = a.user_id ${clause}`,
      values,
    )
    const [data] = await db.execute(
      `SELECT a.id, d.name AS device, a.action, a.status,
        COALESCE(u.username, 'Hệ thống') AS user, a.recorded_at AS time
       FROM ActionHistory a JOIN Device d ON d.id = a.device_id
       LEFT JOIN \`User\` u ON u.id = a.user_id ${clause}
       ORDER BY a.recorded_at ${order}, a.id ${order} LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    )
    return res.json({
      data,
      page,
      limit,
      total: count.total
    })
  } catch (error) {
    return handleError(res, error)
  }
})

function virtualEsp32Id(req) {
  const id = req.query.esp32Id ?? 'ESP32-01'
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    const error = new Error('esp32Id không hợp lệ.')
    error.status = 400
    throw error
  }
  return id
}

app.get('/api/virtual-alerts', authenticate, async (req, res) => {
  try {
    return res.json(await getVirtualAlertState(virtualEsp32Id(req)))
  } catch (error) { return handleError(res, error) }
})

app.get('/api/virtual-alerts/daily', authenticate, async (req, res) => {
  try {
    const esp32Id = virtualEsp32Id(req)
    let range
    try { range = dailyRange(req.query.from, req.query.to) }
    catch (error) { error.status = 400; throw error }
    return res.json(await getVirtualAlertDaily(esp32Id, range.from, range.to))
  } catch (error) { return handleError(res, error) }
})

app.use((req, res) => res.status(404).json({
  error: `Không tìm thấy API: ${req.method} ${req.originalUrl}`
}))

export default app
