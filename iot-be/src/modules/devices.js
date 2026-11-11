import { db as defaultDb } from '../config/database.js'
import { sendDeviceCommand as defaultSendDeviceCommand, receiveDeviceResponse as defaultReceiveDeviceResponse } from '../integrations/mqtt/mqtt.client.js'
import { emit as defaultEmit } from '../integrations/websocket/socket.js'
import { events as defaultEvents } from '../integrations/websocket/events.js'
import { authenticate } from '../middlewares/authenticate.js'
import { requireDeviceControl } from '../middlewares/authorize.js'
import { HttpError } from '../shared/http-error.js'

export function registerDeviceRoutes(app, {
  db = defaultDb,
  sendDeviceCommand = defaultSendDeviceCommand,
  emit = defaultEmit,
  events = defaultEvents,
} = {}) {
  app.patch('/api/devices/:id/status', authenticate, requireDeviceControl, async (req, res) => {
    let connection
    let historyId
    let historyCompleted = false
    try {
      const id = Number(req.params.id)
      if (![1, 2, 3].includes(id)) throw new HttpError(400, 'Chỉ hỗ trợ điều khiển từng thiết bị (ID 1–3).')
      const status = String((req.body && req.body.status) || '').toUpperCase()
      if (!['ON', 'OFF'].includes(status)) throw new HttpError(400, 'status chỉ nhận ON hoặc OFF.')

      const [devices] = await db.execute('SELECT id FROM Device WHERE id = ?', [id])
      if (!devices[0]) throw new HttpError(404, 'Không tìm thấy thiết bị.')
      const [history] = await db.execute(
        `INSERT INTO ActionHistory (user_id, device_id, action, status)
         VALUES (?, ?, ?, 'LOADING')`,
        [req.user.id, id, status === 'ON' ? 'BẬT' : 'TẮT'],
      )
      historyId = history.insertId
      emit(events.activity, { id: historyId, status: 'LOADING' })

      const response = await sendDeviceCommand(id, status === 'ON')

      const actualStatus = response.actualState ? 'ON' : 'OFF'

      connection = await db.getConnection()
      await connection.beginTransaction()
      await connection.execute('UPDATE Device SET status = ? WHERE id = ?', [actualStatus, id])
      await connection.execute("UPDATE ActionHistory SET status = 'THÀNH CÔNG' WHERE id = ?", [historyId])
      await connection.commit()
      
      historyCompleted = true
      emit(events.activity, { id: historyId, status: 'THÀNH CÔNG' })
      const [updated] = await connection.execute('SELECT id, name, status FROM Device WHERE id = ?', [id])
      emit(events.device, updated[0])
      return res.json(updated[0])
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {})
      if (historyId && !historyCompleted) {
        try {
          await db.execute(
            "UPDATE ActionHistory SET status = 'THẤT BẠI' WHERE id = ? AND status = 'LOADING'",
            [historyId],
          )
          emit(events.activity, { id: historyId, status: 'THẤT BẠI' })
        } catch (historyError) {
          console.error('Không thể ghi lịch sử thao tác thất bại:', historyError)
        }
      }
      throw error
    } finally {
      if (connection) connection.release()
    }
  })
}

export function recordDeviceResponse(response, {
  db = defaultDb,
  receiveDeviceResponse = defaultReceiveDeviceResponse,
  emit = defaultEmit,
  events = defaultEvents,
} = {}) {
  const deviceId = Number(response.deviceId)
  if (![1, 2, 3].includes(deviceId) || typeof response.actualState !== 'boolean') return false
  const status = response.actualState ? 'ON' : 'OFF'
  db.execute('UPDATE Device SET status = ? WHERE id = ?', [status, deviceId])
    .catch((error) => console.error('Device response:', error.message))
  emit(events.device, { id: deviceId, status })
  receiveDeviceResponse(response)
  return true
}

export async function markPendingActionsFailed(db = defaultDb) {
  await db.execute("UPDATE ActionHistory SET status = 'THẤT BẠI' WHERE status = 'LOADING'")
}
