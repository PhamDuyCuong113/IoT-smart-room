import { db } from '../config/database.js'
import { emit } from '../integrations/websocket/socket.js'
import { events } from '../integrations/websocket/events.js'
import { authenticate } from '../middlewares/authenticate.js'
import { HttpError } from '../shared/http-error.js'

export const virtualSensors = [
  { sensorId: 'sensor1', name: 'Cảm biến ảo 1', pin: 25 },
  { sensorId: 'sensor2', name: 'Cảm biến ảo 2', pin: 26 },
  { sensorId: 'sensor3', name: 'Cảm biến ảo 3', pin: 27 },
]

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

export const localToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
const shiftDate = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)

export function dailyRange(from, to) {
  to = to ?? localToday()
  if (!validDate(to)) throw new Error('Ngày kết thúc không hợp lệ.')
  from = from ?? shiftDate(to, -6)
  if (!validDate(from) || from > to || Date.parse(to) - Date.parse(from) > 30 * 86400000) {
    throw new Error('Chọn khoảng ngày hợp lệ, tối đa 31 ngày.')
  }
  return { from, to }
}

export function validateVirtualAlerts(data) {
  if (!data || typeof data.esp32Id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.esp32Id) ||
      typeof data.timeSynced !== 'boolean' || !Array.isArray(data.leds) || data.leds.length !== 3) {
    throw new Error('Bản tin cảnh báo không hợp lệ.')
  }
  const date = typeof data.date === 'string' && /^\d{8}$/.test(data.date)
    ? `${data.date.slice(0, 4)}-${data.date.slice(4, 6)}-${data.date.slice(6, 8)}` : null
  if (data.timeSynced && !validDate(date)) throw new Error('Ngày cảnh báo không hợp lệ.')
  for (const sensor of virtualSensors) {
    const led = data.leds.find((item) => item?.sensorId === sensor.sensorId)
    if (!led || led.pin !== sensor.pin || !Number.isInteger(led.y) || led.y < 1 || led.y > 1000000 ||
        !Number.isInteger(led.sensorValue) || led.sensorValue < 0 || led.sensorValue >= led.y ||
        led.threshold !== led.y / 2 || typeof led.alertActive !== 'boolean' ||
        typeof led.hardwareLedOn !== 'boolean' || (led.hardwareLedOn && !led.alertActive) ||
        led.alertActive !== (led.sensorValue > led.y / 2) ||
        !Number.isSafeInteger(led.alertsToday) || led.alertsToday < 0 || led.alertsToday > 4294967295) {
      throw new Error(`Dữ liệu ${sensor.sensorId} không hợp lệ.`)
    }
  }
  return { ...data, date: data.timeSynced ? date : null }
}

export async function saveVirtualAlerts(snapshot) {
  const data = validateVirtualAlerts(snapshot)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    for (const led of data.leds) {
      await connection.execute(
        `INSERT INTO VirtualAlertState
         (esp32_id, sensor_id, value, max_value, threshold, alert_active, hardware_led_on, time_synced, alert_date, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE value = VALUES(value), max_value = VALUES(max_value), threshold = VALUES(threshold),
         alert_active = VALUES(alert_active), hardware_led_on = VALUES(hardware_led_on),
         time_synced = VALUES(time_synced), alert_date = VALUES(alert_date), received_at = VALUES(received_at)`,
        [data.esp32Id, led.sensorId, led.sensorValue, led.y, led.threshold,
          led.alertActive, led.hardwareLedOn, data.timeSynced, data.date],
      )
      if (data.timeSynced) await connection.execute(
        `INSERT INTO VirtualAlertDaily (esp32_id, alert_date, sensor_id, alert_count) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE alert_count = GREATEST(alert_count, VALUES(alert_count))`,
        [data.esp32Id, data.date, led.sensorId, led.alertsToday],
      )
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
  emit(events.virtualAlerts, { esp32Id: data.esp32Id })
}

export async function getVirtualAlertState(esp32Id) {
  const [rows] = await db.execute('SELECT * FROM VirtualAlertState WHERE esp32_id = ?', [esp32Id])
  return {
    esp32Id,
    leds: virtualSensors.map((sensor) => {
      const row = rows.find((item) => item.sensor_id === sensor.sensorId)
      return {
        ...sensor,
        hasData: Boolean(row),
        sensorValue: row?.value ?? null,
        y: row?.max_value ?? 100,
        threshold: row?.threshold ?? 50,
        alertActive: Boolean(row?.alert_active),
        hardwareLedOn: Boolean(row?.hardware_led_on),
        timeSynced: Boolean(row?.time_synced),
        date: row?.alert_date ?? null,
        receivedAt: row ? new Date(row.received_at.replace(' ', 'T') + 'Z').toISOString() : null,
      }
    }),
  }
}

export async function getVirtualAlertDaily(esp32Id, from, to) {
  const [rows] = await db.execute(
    `SELECT alert_date AS date,
     SUM(CASE WHEN sensor_id = 'sensor1' THEN alert_count END) AS sensor1,
     SUM(CASE WHEN sensor_id = 'sensor2' THEN alert_count END) AS sensor2,
     SUM(CASE WHEN sensor_id = 'sensor3' THEN alert_count END) AS sensor3,
     SUM(alert_count) AS total
     FROM VirtualAlertDaily WHERE esp32_id = ? AND alert_date BETWEEN ? AND ?
     GROUP BY alert_date ORDER BY alert_date DESC`,
    [esp32Id, from, to],
  )
  const data = rows.map((row) => ({
    date: row.date,
    ...Object.fromEntries(
      ['sensor1', 'sensor2', 'sensor3', 'total'].map((key) => [key, row[key] === null ? null : Number(row[key])]),
    ),
  }))
  return { esp32Id, from, to, data }
}

export function registerVirtualAlertRoutes(app) {
  app.get('/api/virtual-alerts', authenticate, async (req, res) => {
    const id = req.query.esp32Id ?? 'ESP32-01'
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new HttpError(400, 'esp32Id không hợp lệ.')
    }
    return res.json(await getVirtualAlertState(id))
  })

  app.get('/api/virtual-alerts/daily', authenticate, async (req, res) => {
    const id = req.query.esp32Id ?? 'ESP32-01'
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw new HttpError(400, 'esp32Id không hợp lệ.')
    }
    let range
    try {
      range = dailyRange(req.query.from, req.query.to)
    } catch (error) {
      error.status = 400
      throw error
    }
    return res.json(await getVirtualAlertDaily(id, range.from, range.to))
  })
}
