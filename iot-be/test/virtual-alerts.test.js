import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { EventEmitter, once } from 'node:events'
import app from '../src/app.js'
import { db } from '../src/config/database.js'
import { createAuthToken } from '../src/auth.js'
import { mqttConfig } from '../src/config/mqtt.config.js'
import { subscribeTelemetry } from '../src/mqtt/mqtt.subscriber.js'
import { initSocket } from '../src/websocket/socket.js'
import { validateVirtualAlerts, handleVirtualAlerts, dailyRange } from '../src/mqtt/virtual-alerts.handler.js'

const esp32Id = `test-${randomUUID()}`
const snapshot = (count = 0, date = '20261104') => ({
  esp32Id, date, timeSynced: true,
  leds: [25, 26, 27].map((pin, index) => ({
    sensorId: `sensor${index + 1}`, pin, y: 100, threshold: 50,
    sensorValue: 49 + index, alertActive: index === 2, hardwareLedOn: index === 2, alertsToday: count,
  })),
})
const send = (data) => handleVirtualAlerts(Buffer.from(JSON.stringify(data)))

test('virtual alert validation', () => {
  assert.equal(validateVirtualAlerts(snapshot()).date, '2026-11-04')
  for (const mutate of [
    s => { s.leds.pop() },
    s => { s.leds[0].sensorId = 'sensor2' },
    s => { s.leds[0].sensorValue = 100 },
    s => { s.leds[0].threshold = 60 },
    s => { s.leds[0].alertActive = true },
    s => { s.leds[0].hardwareLedOn = true },
    s => { s.leds[0].alertsToday = -1 },
    s => { s.leds[0].alertActive = 'false' },
    s => { s.date = '20260230' },
  ]) {
    const s = snapshot(); mutate(s)
    assert.throws(() => validateVirtualAlerts(s))
  }
  assert.equal(validateVirtualAlerts({ ...snapshot(), timeSynced: false, date: '' }).date, null)
  assert.throws(() => dailyRange('2026-10-01', '2026-11-01'))
  assert.throws(() => dailyRange('2026-11-05', '2026-11-04'))
  assert.throws(() => dailyRange('2026-02-30', '2026-03-01'))
  assert.deepEqual(dailyRange('2026-11-01', '2026-11-30'), { from: '2026-11-01', to: '2026-11-30' })
})

test('MySQL, API and MQTT virtual alerts integration (isolated fixture)', async (t) => {
  const server = createServer(app)
  const io = initSocket(server, '*')
  const notifications = []
  const originalEmit = io.emit
  io.emit = function (event, data) { notifications.push({ event, data }); return originalEmit.call(this, event, data) }
  let userId
  try {
    const [created] = await db.execute(
      'INSERT INTO `User` (username, password, fullName, role) VALUES (?, ?, ?, ?)',
      [esp32Id, 'unused-fixture-password', 'Virtual alert test', 'viewer'],
    )
    userId = created.insertId
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    const headers = { Authorization: `Bearer ${createAuthToken(userId)}` }
    const request = (path) => fetch(`${origin}${path}`, { headers })
    const endpoint = `/api/virtual-alerts?esp32Id=${esp32Id}`
    const history = `/api/virtual-alerts/daily?esp32Id=${esp32Id}`

    await t.test('authentication, empty device, API index and validation', async () => {
      assert.equal((await fetch(`${origin}/api/virtual-alerts`)).status, 401)
      assert.equal((await fetch(`${origin}/api/virtual-alerts/daily`)).status, 401)
      const empty = await (await request(endpoint)).json()
      assert.equal(empty.leds.length, 3)
      assert.ok(empty.leds.every(led => !led.hasData))
      for (const path of ['/api/virtual-alerts?esp32Id=bad!', `${history}&from=2026-02-30`, `${history}&from=2026-10-01&to=2026-11-01`]) {
        assert.equal((await request(path)).status, 400)
      }
      const index = await (await request('/api')).json()
      assert.ok(index.endpoints.includes('/api/virtual-alerts'))
      const defaultDays = await (await request(history)).json()
      assert.deepEqual(defaultDays.data, [])
    })

    await t.test('49 and 50 off, 51 on; daily totals do not duplicate or decrease', async () => {
      for (const count of [0, 5, 5, 3]) await send(snapshot(count))
      const state = await (await request(endpoint)).json()
      assert.deepEqual(state.leds.map(led => led.alertActive), [false, false, true])
      assert.ok(state.leds.every(led => led.timeSynced && led.date === '2026-11-04' && led.receivedAt.endsWith('Z')))
      const records = await (await request(`${history}&from=2026-11-03&to=2026-11-04`)).json()
      assert.equal(records.data[0].sensor1, 5)
      assert.equal(records.data[0].total, 15)
      assert.equal(records.data.length, 1)
      assert.equal(records.data[0].date, '2026-11-04')
      assert.ok(notifications.some(n => n.event === 'virtual-alerts:updated' && n.data.esp32Id === esp32Id))
    })

    await t.test('unsynced clock updates LEDs without writing statistics; new day preserves history', async () => {
      await send({ ...snapshot(99), timeSynced: false, date: '' })
      const state = await (await request(endpoint)).json()
      assert.ok(state.leds.every(led => !led.timeSynced && led.date === null))
      await send(snapshot(2, '20261105'))
      const records = await (await request(`${history}&from=2026-11-04&to=2026-11-05`)).json()
      assert.deepEqual(records.data.map(row => row.total), [6, 15])
      await assert.rejects(() => send({ ...snapshot(), leds: [] }))
      assert.equal((await (await request(`${history}&from=2026-11-04&to=2026-11-04`)).json()).data[0].total, 15)
    })

    await t.test('MQTT subscribes on reconnect and queues snapshots; malformed JSON does not stop later updates', async () => {
      const client = new EventEmitter()
      const subscriptions = []
      client.subscribe = topics => subscriptions.push(topics)
      subscribeTelemetry(client)
      client.emit('connect'); client.emit('connect')
      assert.equal(subscriptions.length, 2)
      assert.ok(subscriptions.every(topics => topics.includes(mqttConfig.telemetryTopic) && topics.includes(mqttConfig.responseTopic) && topics.includes(mqttConfig.virtualAlertsTopic)))
      const completed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MQTT queue timeout')), 5000)
        const poll = async () => {
          const [[row]] = await db.execute('SELECT alert_count FROM VirtualAlertDaily WHERE esp32_id = ? AND alert_date = ? AND sensor_id = ?', [esp32Id, '2026-11-06', 'sensor1'])
          if (Number(row?.alert_count) === 8) { clearTimeout(timer); resolve() }
          else setTimeout(poll, 10)
        }; poll().catch(reject)
      })
      client.emit('message', mqttConfig.virtualAlertsTopic, Buffer.from('bad-json'))
      client.emit('message', mqttConfig.virtualAlertsTopic, Buffer.from(JSON.stringify(snapshot(4, '20261106'))))
      client.emit('message', mqttConfig.virtualAlertsTopic, Buffer.from(JSON.stringify(snapshot(8, '20261106'))))
      await completed
    })
  } finally {
    await db.execute('DELETE FROM VirtualAlertDaily WHERE esp32_id = ?', [esp32Id])
    await db.execute('DELETE FROM VirtualAlertState WHERE esp32_id = ?', [esp32Id])
    if (userId) await db.execute('DELETE FROM `User` WHERE id = ? AND username = ?', [userId, esp32Id])
    await new Promise(resolve => io.close(resolve))
    await db.end()
  }
})
