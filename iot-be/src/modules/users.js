import { db } from '../config/database.js'
import { authenticate } from '../middlewares/authenticate.js'
import { requireAdmin } from '../middlewares/authorize.js'
import { HttpError } from '../shared/http-error.js'
import { isAdmin } from '../shared/security/roles.js'

const profileFields = 'id, username, fullName, student_id, `class`, email, phone, github, figma, report, postman, role'

export function publicUser(user) {
  return { id: user.id, username: user.username, fullName: user.fullName, role: user.role }
}

export function registerUserRoutes(app) {
  app.get('/api/users', authenticate, requireAdmin, async (req, res) => {
    const [users] = await db.execute('SELECT id, username, fullName, role FROM `User` ORDER BY id')
    return res.json(users)
  })

  app.patch('/api/users/:id/role', authenticate, requireAdmin, async (req, res) => {
    const id = Number(req.params.id)
    const role = String(req.body?.role || '').trim().toLowerCase()
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'ID người dùng không hợp lệ.')
    if (!['admin', 'operator', 'viewer'].includes(role)) {
      throw new HttpError(400, 'Vai trò phải là admin, operator hoặc viewer.')
    }

    const [users] = await db.execute('SELECT id, username, fullName, role FROM `User` WHERE id = ?', [id])
    const target = users[0]
    if (!target) throw new HttpError(404, 'Không tìm thấy người dùng.')
    if (isAdmin(target.role) && role !== 'admin') {
      const [rows] = await db.execute("SELECT COUNT(*) AS total FROM `User` WHERE LOWER(role) IN ('admin', 'quản trị viên')")
      if (Number(rows[0].total) <= 1) {
        throw new HttpError(409, 'Hãy cấp quyền quản trị cho người khác trước khi hạ quyền quản trị viên cuối cùng.')
      }
    }

    await db.execute('UPDATE `User` SET role = ? WHERE id = ?', [role, id])
    return res.json({ ...publicUser(target), role })
  })

  app.get('/api/profile/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'ID người dùng không hợp lệ.')
    const [users] = await db.execute(`SELECT ${profileFields} FROM \`User\` WHERE id = ?`, [id])
    if (!users[0]) throw new HttpError(404, 'Không tìm thấy người dùng.')
    return res.json(users[0])
  })

  app.put('/api/profile/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'ID người dùng không hợp lệ.')
    const [users] = await db.execute(`SELECT ${profileFields} FROM \`User\` WHERE id = ?`, [id])
    const current = users[0]
    if (!current) throw new HttpError(404, 'Không tìm thấy người dùng.')

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
    const [updated] = await db.execute(`SELECT ${profileFields} FROM \`User\` WHERE id = ?`, [id])
    return res.json(updated[0])
  })
}
