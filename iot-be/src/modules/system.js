import { db } from '../config/database.js'

const endpoints = [
  '/api/health', '/api/auth/register', '/api/auth/login', '/api/auth/me',
  '/api/users', '/api/users/:id/role', '/api/profile/:id', '/api/dashboard',
  '/api/sensor-data', '/api/devices/:id/status', '/api/activity-history',
  '/api/virtual-alerts', '/api/virtual-alerts/daily',
]

export function registerSystemRoutes(app) {
  app.get('/', (req, res) => res.json({
    ok: true,
    service: 'iot-be',
    health: '/api/health',
    api: '/api',
    docs: '/api-docs',
  }))

  app.get('/api', (req, res) => res.json({ ok: true, endpoints }))

  app.get('/api/health', async (req, res) => {
    await db.query('SELECT 1')
    return res.json({ ok: true, database: 'connected' })
  })
}
