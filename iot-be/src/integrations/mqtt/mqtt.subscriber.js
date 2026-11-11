import { mqttConfig } from '../../config/mqtt.config.js'
import { handleTelemetry } from './telemetry.handler.js'
import { handleDeviceResponse } from './device-response.handler.js'
import { handleVirtualAlerts } from './virtual-alerts.handler.js'

export function subscribeTelemetry(client) {
  if (!client) return
  let alertQueue = Promise.resolve()
  const topics = [
    mqttConfig.telemetryTopic,
    mqttConfig.responseTopic,
    mqttConfig.virtualAlertsTopic,
  ]
  const subscribe = () => client.subscribe(topics, (error, granted = []) => {
    if (error) {
      console.error('[MQTT] Không đăng ký được topic:', error.message)
      return
    }
    for (const { topic, qos } of granted) {
      if (qos > 2) console.error(`[MQTT] Broker từ chối đăng ký topic: ${topic}`)
      else console.log(`[MQTT] Đã đăng ký ${topic} (QoS ${qos}).`)
    }
  })
  client.on('connect', subscribe)
  if (client.connected) subscribe()
  client.on('message', (topic, payload) => {
    console.log(`[MQTT] Nhận ${topic}:`, payload.toString())
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
      handleDeviceResponse(payload)
    } catch (error) {
      console.error('Device response:', error.message)
    }
  })
}
