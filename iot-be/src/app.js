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
  endpoints: ['/api/health', '/api/auth/register', '/api/auth/login', '/api/profile/:id', '/api/dashboard', '/api/sensor-data', '/api/devices', '/api/activity-history'],
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
  try {
    let {
      username,
      password,
      fullName
    } = req.body || {}
    if (typeof username !== 'string' || !username.trim() || !password ||
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

    const [users] = await db.execute('SELECT id FROM `User` WHERE username = ?', [username])
    if (users.length) return res.status(409).json({
      error: 'Tên người dùng đã tồn tại.'
    })

    const [result] = await db.execute(
      'INSERT INTO `User` (username, password, fullName) VALUES (?, ?, ?)',
      [username, await bcrypt.hash(password, 10), fullName],
    )
    const [created] = await db.execute('SELECT id, username, fullName, role FROM `User` WHERE id = ?', [result.insertId])
    return res.status(201).json(created[0])
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({
      error: 'Tên người dùng đã tồn tại.'
    })
    return handleError(res, error)
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
    return res.json({ id: user.id, username: user.username, fullName: user.fullName, role: user.role })
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
    const columns = {
      time: "DATE_FORMAT(d.recorded_at, '%d/%m/%Y %H:%i:%s')",
      value: "CONCAT(d.value, ' ', s.unit)",
      device: 's.name',
      id: 'd.id',
    }
    const where = []
    const values = []
    if (q) {
      if (by === 'id') {
        where.push('d.id = ?')
        values.push(Number(q) || -1)
      } else if (by === 'all') {
        where.push("(CAST(d.id AS CHAR) LIKE ? OR CONCAT(d.value, ' ', s.unit) LIKE ? OR s.name LIKE ? OR DATE_FORMAT(d.recorded_at, '%d/%m/%Y %H:%i:%s') LIKE ?)")
        values.push(...Array(4).fill(`%${q}%`))
      } else {
        where.push(`${columns[by] || columns.device} LIKE ?`)
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

app.patch('/api/devices/:id/status', async (req, res) => {
  let connection
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
    const response = await sendDeviceCommand(id, status === 'ON')
    const actualStatus = response.actualState ? 'ON' : 'OFF'

    connection = await db.getConnection()
    await connection.beginTransaction()
    await connection.execute('UPDATE Device SET status = ? WHERE id = ?', [actualStatus, id])
    await connection.execute(
      `INSERT INTO ActionHistory (user_id, device_id, action, status, mode)
       VALUES (?, ?, ?, 'THÀNH CÔNG', 'THỦ CÔNG')`,
      [null, id, actualStatus === 'ON' ? 'BẬT' : 'TẮT'],
    )
    await connection.commit()
    const [updated] = await connection.execute('SELECT id, name, status FROM Device WHERE id = ?', [id])
    emit(events.device, updated[0])
    return res.json(updated[0])
  } catch (error) {
    if (connection) await connection.rollback().catch(() => {})
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
      `SELECT a.id, d.name AS device, a.action, a.status, a.mode,
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

app.use((req, res) => res.status(404).json({
  error: `Không tìm thấy API: ${req.method} ${req.originalUrl}`
}))

export default app
