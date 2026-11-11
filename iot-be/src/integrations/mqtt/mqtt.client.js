import mqtt from 'mqtt'
import { randomUUID } from 'node:crypto'
import { mqttConfig } from '../../config/mqtt.config.js'

let client
const pending = new Map()

export function initMqtt() {
  if (!mqttConfig.url) {
    console.warn('[MQTT] Chưa cấu hình MQTT_URL; backend không nhận dữ liệu ESP32 qua MQTT.')
    return null
  }
  client = mqtt.connect(mqttConfig.url, {
    username: mqttConfig.username || undefined,
    password: mqttConfig.password || undefined,
  })
  client.on('connect', () => console.log('MQTT connected'))
  client.on('offline', () => console.warn('[MQTT] Mất kết nối Broker, đang chờ kết nối lại.'))
  client.on('error', (error) => console.error('MQTT:', error.message))
  return client
}

export function sendDeviceCommand(deviceId, state) {
  if (!client?.connected) {
    const error = new Error('MQTT chưa kết nối tới ESP32.')
    error.status = 503
    return Promise.reject(error)
  }

  const requestId = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId)
      const error = new Error('ESP32 không phản hồi lệnh điều khiển.')
      error.status = 504
      reject(error)
    }, 8000)

    pending.set(requestId, { resolve, reject, timer, state })
    client.publish(mqttConfig.deviceTopic, JSON.stringify({ requestId, deviceId, state }), (error) => {
      if (!error) return
      clearTimeout(timer)
      pending.delete(requestId)
      error.status = 502
      reject(error)
    })
  })
}

export function receiveDeviceResponse(response) {
  const request = pending.get(response.requestId)
  if (!request) return false

  clearTimeout(request.timer)
  pending.delete(response.requestId)
  if (response.success && response.actualState === request.state) request.resolve(response)
  else {
    const error = new Error(response.message || 'ESP32 không thực hiện được lệnh.')
    error.status = 502
    request.reject(error)
  }
  return true
}
