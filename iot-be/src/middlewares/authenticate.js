import { db } from '../config/database.js'
import { verifyAuthToken } from '../shared/security/tokens.js'

export async function authenticate(req, res, next) {
  const token = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '')?.[1]
  const claims = verifyAuthToken(token)
  if (!claims) {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' })
  }

  try {
    const [users] = await db.execute(
      'SELECT id, username, fullName, role FROM `User` WHERE id = ?',
      [claims.sub],
    )
    const user = users[0]
    if (!user) return res.status(401).json({ error: 'Tài khoản không còn tồn tại.' })
    req.user = user
    return next()
  } catch (error) {
    return next(error)
  }
}
