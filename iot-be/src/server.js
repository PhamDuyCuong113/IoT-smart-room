import { createServer } from 'node:http'
import app from './app.js'
import { db } from './config/database.js'
import { env } from './config/env.js'
import { initMqtt } from './integrations/mqtt/mqtt.client.js'
import { subscribeTelemetry } from './integrations/mqtt/mqtt.subscriber.js'
import { initSocket } from './integrations/websocket/socket.js'
import { markPendingActionsFailed } from './modules/devices.js'

await db.query('SELECT 1')
// Pending commands from a previous process can no longer receive their acknowledgement.
await markPendingActionsFailed()
const server = createServer(app)
initSocket(server, env.clientUrl)
subscribeTelemetry(initMqtt())
server.listen(env.port, () => console.log(`API listening at http://localhost:${env.port}`))
