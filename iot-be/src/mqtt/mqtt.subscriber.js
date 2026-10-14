import { mqttConfig } from '../config/mqtt.config.js'
import { db } from '../config/database.js'
import { handleTelemetry } from './telemetry.handler.js'
import { receiveDeviceResponse } from './mqtt.client.js'
import { emit } from '../websocket/socket.js'
import { events } from '../websocket/events.js'

export function subscribeTelemetry(client) {
  if (!client) return
  client.subscribe([mqttConfig.telemetryTopic, mqttConfig.responseTopic])
  client.on('message', (topic, payload) => {
    if (topic === mqttConfig.telemetryTopic) {
      handleTelemetry(payload).catch((error) => console.error('Telemetry:', error.message))
      return
    }
    if (topic !== mqttConfig.responseTopic) return

    try {
      const response = JSON.parse(payload.toString())
      if (![1, 2, 3].includes(Number(response.deviceId)) || typeof response.actualState !== 'boolean') return
      const status = response.actualState ? 'ON' : 'OFF'
      db.execute('UPDATE Device SET status = ? WHERE id = ?', [status, Number(response.deviceId)])
        .catch((error) => console.error('Device response:', error.message))
      emit(events.device, { id: Number(response.deviceId), status })
      receiveDeviceResponse(response)
    } catch (error) { console.error('Device response:', error.message) }
  })
}
