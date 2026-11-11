import bcrypt from 'bcryptjs'
import { db } from '../config/database.js'
import { env } from '../config/env.js'
import { authenticate } from '../middlewares/authenticate.js'
import { HttpError } from '../shared/http-error.js'
import { isAdmin } from '../shared/security/roles.js'
import { createAuthToken } from '../shared/security/tokens.js'
import { publicUser } from './users.js'

export function registerAuthRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    let connection
    let lockAcquired = false
    try {
      let { username, password, fullName } = req.body || {}
      if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password ||
          typeof fullName !== 'string' || !fullName.trim()) {
        throw new HttpError(400, 'username, password và fullName là bắt buộc.')
      }
      if (password.length < 6) throw new HttpError(400, 'Mật khẩu cần ít nhất 6 ký tự.')
      username = username.trim()
      fullName = fullName.trim()

      connection = await db.getConnection()
      const [lockRows] = await connection.query("SELECT GET_LOCK('smart_room_auth_register', 5) AS acquired")
      lockAcquired = Number(lockRows[0]?.acquired) === 1
      if (!lockAcquired) throw new HttpError(503, 'Không thể tạo tài khoản lúc này. Vui lòng thử lại.')

      const [users] = await connection.execute('SELECT id FROM `User` WHERE username = ?', [username])
      if (users.length) throw new HttpError(409, 'Tên người dùng đã tồn tại.')

      const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM `User`')
      const role = Number(count.total) === 0 ? 'admin' : 'viewer'
      const [result] = await connection.execute(
        'INSERT INTO `User` (username, password, fullName, role) VALUES (?, ?, ?, ?)',
        [username, await bcrypt.hash(password, 10), fullName, role],
      )
      const [created] = await connection.execute(
        'SELECT id, username, fullName, role FROM `User` WHERE id = ?',
        [result.insertId],
      )
      return res.status(201).json(publicUser(created[0]))
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Tên người dùng đã tồn tại.')
      throw error
    } finally {
      if (connection) {
        if (lockAcquired) await connection.query("SELECT RELEASE_LOCK('smart_room_auth_register')").catch(() => {})
        connection.release()
      }
    }
  })

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {}
    if (!username || !password) throw new HttpError(400, 'username và password là bắt buộc.')

    const [users] = await db.execute(
      'SELECT id, username, password, fullName, role FROM `User` WHERE username = ?',
      [username],
    )
    const user = users[0]
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.')
    }
    if (Number(user.id) === env.defaultUserId) {
      const [admins] = await db.execute("SELECT id FROM `User` WHERE LOWER(role) IN ('admin', 'quản trị viên') LIMIT 1")
      if (!admins.length) {
        await db.execute("UPDATE `User` SET role = 'admin' WHERE id = ?", [user.id])
        user.role = 'admin'
      }
    }
    return res.json({ token: createAuthToken(user.id), user: publicUser(user) })
  })

  app.get('/api/auth/me', authenticate, (req, res) => res.json(publicUser(req.user)))
}
