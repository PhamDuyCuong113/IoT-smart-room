import { db } from '../config/database.js'
import { emit } from '../websocket/socket.js'
import { events } from '../websocket/events.js'

export async function handleTelemetry(payload) {
  const data = JSON.parse(payload.toString())
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
    const [result] = await db.execute('INSERT INTO DataSensor (sensor_id, value) VALUES (?, ?)', [sensor.id, Number(value)])
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
