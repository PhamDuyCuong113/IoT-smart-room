import { db } from '../config/database.js'
import { emit } from '../integrations/websocket/socket.js'
import { events } from '../integrations/websocket/events.js'
import { HttpError } from '../shared/http-error.js'

const sensorNames = {
  light: 'Cảm biến ánh sáng',
  humidity: 'DHT11 - Độ ẩm',
  temperature: 'DHT11 - Nhiệt độ',
}

export function registerSensorRoutes(app) {
  app.get('/api/sensor-data', async (req, res) => {
    const { q = '', by = 'all', sort = 'newest' } = req.query
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10))
    if (!['all', 'time', ...Object.keys(sensorNames)].includes(by)) {
      throw new HttpError(400, 'Tiêu chí tìm kiếm cảm biến không hợp lệ.')
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
    const [[count]] = await db.execute(
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
    return res.json({ data, page, limit, total: count.total })
  })

  app.post('/api/sensor-data', async (req, res) => {
    const { sensor_id, value, recorded_at } = req.body || {}
    if (sensor_id == null || !Number.isInteger(Number(sensor_id)) || Number(sensor_id) < 1 ||
        value == null || value === '' || !Number.isFinite(Number(value))) {
      throw new HttpError(400, 'sensor_id và value là bắt buộc; value phải là số.')
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
  })
}

export async function processTelemetry(data) {
  const readings = []
  for (const [name, unit, value] of [
    ['DHT11 - Nhiệt độ', '°C', data.temperature],
    ['DHT11 - Độ ẩm', '%', data.humidity],
    ['Cảm biến ánh sáng', 'ADC', data.light],
  ]) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) continue
    await db.execute(
      'INSERT INTO Sensor (name, unit) VALUES (?, ?) ON DUPLICATE KEY UPDATE unit = VALUES(unit)',
      [name, unit],
    )
    const [[sensor]] = await db.execute('SELECT id FROM Sensor WHERE name = ?', [name])
    const [result] = await db.execute(
      'INSERT INTO DataSensor (sensor_id, value) VALUES (?, ?)',
      [sensor.id, Number(value)],
    )
    const [[reading]] = await db.execute(
      `SELECT d.id, d.value, s.unit, d.recorded_at, s.name AS sensor
       FROM DataSensor d JOIN Sensor s ON s.id = d.sensor_id WHERE d.id = ?`,
      [result.insertId],
    )
    readings.push(reading)
    emit(events.sensor, reading)
  }
  return readings
}
