import test from 'node:test'
import assert from 'node:assert/strict'
import { registerDeviceRoutes, recordDeviceResponse } from '../../src/modules/devices.js'

function fixture({ command = async () => ({ actualState: true }), failDeviceUpdate = false, deviceExists = true } = {}) {
  const emitted = []
  const calls = []
  const connectionState = { began: false, committed: false, rolledBack: false, released: false }
  const connection = {
    async beginTransaction() { connectionState.began = true },
    async execute(sql, values) {
      calls.push({ location: 'connection', sql, values })
      if (failDeviceUpdate && sql.startsWith('UPDATE Device')) throw new Error('device write failed')
      if (sql.startsWith('SELECT id, name, status')) return [[{ id: 1, name: 'Fan', status: 'ON' }]]
      return [{ affectedRows: 1 }]
    },
    async commit() { connectionState.committed = true },
    async rollback() { connectionState.rolledBack = true },
    release() { connectionState.released = true },
  }
  const db = {
    async execute(sql, values) {
      calls.push({ location: 'pool', sql, values })
      if (sql.startsWith('SELECT id FROM Device')) return [deviceExists ? [{ id: 1 }] : []]
      if (sql.startsWith('INSERT INTO ActionHistory')) return [{ insertId: 42 }]
      return [{ affectedRows: 1 }]
    },
    async getConnection() { return connection },
  }
  const app = {
    patch(path, ...handlers) { this.registration = { path, handlers } },
  }
  const dependencies = {
    db,
    sendDeviceCommand: command,
    receiveDeviceResponse: (response) => calls.push({ location: 'ack', response }),
    emit: (event, data) => emitted.push({ event, data }),
  }
  registerDeviceRoutes(app, dependencies)

  async function invoke(req) {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this },
      json(body) { this.body = body; return body },
    }
    const routeHandler = app.registration.handlers.at(-1)
    await routeHandler(req, res)
    return res
  }
  return { invoke, dependencies, emitted, calls, connectionState }
}

test('device route records LOADING then commits the acknowledged state', async () => {
  const { invoke, emitted, connectionState } = fixture()
  const response = await invoke({ params: { id: '1' }, body: { status: 'on' }, user: { id: 7 } })
  assert.deepEqual(response.body, { id: 1, name: 'Fan', status: 'ON' })
  assert.deepEqual(emitted.map(({ data }) => data.status), ['LOADING', 'THÀNH CÔNG', 'ON'])
  assert.equal(connectionState.began, true)
  assert.equal(connectionState.committed, true)
  assert.equal(connectionState.rolledBack, false)
  assert.equal(connectionState.released, true)
})

test('device command failure records THẤT BẠI without opening a transaction', async () => {
  const error = Object.assign(new Error('ESP32 không phản hồi lệnh điều khiển.'), { status: 504 })
  const { invoke, emitted, calls, connectionState } = fixture({ command: async () => { throw error } })
  await assert.rejects(invoke({ params: { id: '1' }, body: { status: 'OFF' }, user: { id: 7 } }), (caught) => caught.status === 504)
  assert.deepEqual(emitted.map(({ data }) => data.status), ['LOADING', 'THẤT BẠI'])
  assert.ok(calls.some(({ sql }) => sql.includes("SET status = 'THẤT BẠI'")))
  assert.equal(connectionState.began, false)
})

test('database failure rolls back and marks the pending action as failed', async () => {
  const { invoke, emitted, calls, connectionState } = fixture({ failDeviceUpdate: true })
  await assert.rejects(invoke({ params: { id: '1' }, body: { status: 'ON' }, user: { id: 7 } }), /device write failed/)
  assert.equal(connectionState.rolledBack, true)
  assert.equal(connectionState.released, true)
  assert.ok(calls.some(({ sql }) => sql.includes("SET status = 'THẤT BẠI'")))
  assert.equal(emitted.at(-1).data.status, 'THẤT BẠI')
})

test('invalid or missing device is rejected before sending an MQTT command', async () => {
  let commandCount = 0
  const command = async () => { commandCount += 1; return { actualState: true } }
  const absent = fixture({ command, deviceExists: false })
  await assert.rejects(absent.invoke({ params: { id: '1' }, body: { status: 'ON' }, user: { id: 7 } }), (error) => error.status === 404)
  await assert.rejects(absent.invoke({ params: { id: '4' }, body: { status: 'ON' }, user: { id: 7 } }), (error) => error.status === 400)
  assert.equal(commandCount, 0)
})

test('device response updates and emits only supported, well-formed acknowledgements', () => {
  const calls = []
  const emitted = []
  const dependencies = {
    db: { execute: async (...args) => { calls.push(args); return [] } },
    receiveDeviceResponse: (response) => calls.push(response),
    emit: (event, data) => emitted.push({ event, data }),
  }
  assert.equal(recordDeviceResponse({ deviceId: 9, actualState: true }, dependencies), false)
  assert.equal(recordDeviceResponse({ deviceId: 1, actualState: 'true' }, dependencies), false)
  assert.equal(recordDeviceResponse({ deviceId: 1, actualState: false }, dependencies), true)
  assert.equal(emitted.at(-1).data.status, 'OFF')
  assert.equal(calls.length, 2)
})
