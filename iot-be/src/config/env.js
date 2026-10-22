import 'dotenv/config'

export const env = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'smart_room',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  authSecret: process.env.AUTH_SECRET?.trim() || '',
  defaultUserId: process.env.DEFAULT_USER_ID?.trim() ? Number(process.env.DEFAULT_USER_ID) : null,
  mqtt: {
    url: process.env.MQTT_URL || '',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    telemetryTopic: process.env.MQTT_TELEMETRY_TOPIC || 'data/sensor',
    deviceTopic: process.env.MQTT_DEVICE_TOPIC || 'device/control',
    responseTopic: process.env.MQTT_RESPONSE_TOPIC || 'device/response',
  },
}
