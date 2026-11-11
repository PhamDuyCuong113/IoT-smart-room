import { db } from '../config/database.js'

function toSqlDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]} ${match[4]}` : value
}

export function registerActivityHistoryRoutes(app) {
  app.get('/api/activity-history', async (req, res) => {
    const where = []
    const values = []
    for (const [key, sql] of Object.entries({
      device: 'd.name = ?',
      action: 'a.action = ?',
      status: 'a.status = ?',
    })) {
      if (req.query[key]) {
        where.push(sql)
        values.push(req.query[key])
      }
    }
    if (req.query.user) {
      where.push('(u.username LIKE ? OR u.fullName LIKE ?)')
      values.push(`%${req.query.user}%`, `%${req.query.user}%`)
    }
    if (req.query.from) {
      where.push('a.recorded_at >= ?')
      values.push(toSqlDate(req.query.from))
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const order = req.query.sort === 'oldest' ? 'ASC' : 'DESC'
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
    const page = Math.max(1, Number(req.query.page) || 1)
    const [[count]] = await db.execute(
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
    return res.json({ data, page, limit, total: count.total })
  })
}
