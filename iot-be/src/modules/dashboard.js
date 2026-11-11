import { db } from '../config/database.js'

export function registerDashboardRoutes(app) {
  app.get('/api/dashboard', async (req, res) => {
    const [[sensors], [series], [devices]] = await Promise.all([
      db.query(`SELECT s.id, s.name, s.unit, d.value, d.recorded_at
        FROM Sensor s LEFT JOIN DataSensor d ON d.id = (
          SELECT MAX(d2.id) FROM DataSensor d2 WHERE d2.sensor_id = s.id
        ) ORDER BY s.id`),
      db.query(`SELECT s.id AS sensor_id, s.name, s.unit, d.value, d.recorded_at
        FROM DataSensor d JOIN Sensor s ON s.id = d.sensor_id
        WHERE d.recorded_at >= NOW() - INTERVAL 6 HOUR ORDER BY d.recorded_at`),
      db.query('SELECT id, name, status FROM Device ORDER BY id'),
    ])
    return res.json({ sensors, series, devices })
  })
}
