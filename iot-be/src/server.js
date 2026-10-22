import { createServer } from 'node:http'
import app from './app.js'
import { db } from './config/database.js'
import { env } from './config/env.js'
import { initMqtt } from './mqtt/mqtt.client.js'
import { subscribeTelemetry } from './mqtt/mqtt.subscriber.js'
import { initSocket } from './websocket/socket.js'

await db.query('SELECT 1')
// Pending commands from a previous process can no longer receive their acknowledgement.
await db.execute("UPDATE ActionHistory SET status = 'THẤT BẠI' WHERE status = 'LOADING'")
const server = createServer(app)
initSocket(server, env.clientUrl)
subscribeTelemetry(initMqtt())
server.listen(env.port, () => console.log(`API listening at http://localhost:${env.port}`))
