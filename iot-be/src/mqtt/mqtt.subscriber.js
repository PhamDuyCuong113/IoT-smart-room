import { mqttConfig } from '../config/mqtt.config.js'
import { db } from '../config/database.js'
import { handleTelemetry } from './telemetry.handler.js'
import { receiveDeviceResponse } from './mqtt.client.js'
import { emit } from '../websocket/socket.js'
import { events } from '../websocket/events.js'
import { handleVirtualAlerts } from './virtual-alerts.handler.js'

export function subscribeTelemetry(client) {
  if (!client) return
  let alertQueue = Promise.resolve()
  const subscribe = () => client.subscribe([mqttConfig.telemetryTopic, mqttConfig.responseTopic, mqttConfig.virtualAlertsTopic])
  client.on('connect', subscribe)
  if (client.connected) subscribe()
  client.on('message', (topic, payload) => {
    if (topic === mqttConfig.virtualAlertsTopic) {
      alertQueue = alertQueue.then(() => handleVirtualAlerts(payload))
        .catch((error) => console.error('Virtual alerts:', error.message))
      return
    }
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
