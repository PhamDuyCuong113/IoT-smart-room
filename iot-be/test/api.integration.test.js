import './setup-test-env.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import bcrypt from 'bcryptjs'
import app from '../src/app.js'
import { db } from '../src/config/database.js'

test('API authentication, roles, profiles, listing and error responses', async () => {
  const server = createServer(app)
  let admin
  let viewer
  const sensorRecordIds = []
  const actionHistoryIds = []
  try {
    const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM `User`')
    assert.equal(Number(total), 0, 'the isolated test database must start without users')

    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const origin = `http://127.0.0.1:${server.address().port}`
    const request = async (path, { token, ...options } = {}) => {
      const headers = new Headers(options.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (options.body) headers.set('Content-Type', 'application/json')
      const response = await fetch(`${origin}${path}`, { ...options, headers })
      return { response, body: await response.json() }
    }

    assert.equal((await request('/')).body.service, 'iot-be')
    assert.equal((await request('/api/health')).body.database, 'connected')
    const dashboard = await request('/api/dashboard')
    assert.equal(dashboard.response.status, 200)
    assert.deepEqual(Object.keys(dashboard.body).sort(), ['devices', 'sensors', 'series'])

    const first = await request('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ username: 'api-admin', password: 'test-password', fullName: 'Test Admin' }),
    })
    assert.equal(first.response.status, 201)
    assert.equal(first.body.role, 'admin')
    admin = first.body

    const second = await request('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ username: 'api-viewer', password: 'test-password', fullName: 'Test Viewer' }),
    })
    assert.equal(second.response.status, 201)
    assert.equal(second.body.role, 'viewer')
    viewer = second.body

    const login = await request('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username: 'api-admin', password: 'test-password' }),
    })
    assert.equal(login.response.status, 200)
    assert.ok(login.body.token)
    const token = login.body.token

    const currentUser = await request('/api/auth/me', { token })
    assert.equal(currentUser.response.status, 200)
    assert.equal(currentUser.body.id, admin.id)

    const viewerLogin = await request('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username: 'api-viewer', password: 'test-password' }),
    })
    assert.equal((await request('/api/users', { token: viewerLogin.body.token })).response.status, 403)
    assert.equal((await request('/api/devices/1/status', {
      method: 'PATCH', token: viewerLogin.body.token, body: JSON.stringify({ status: 'ON' }),
    })).response.status, 403)

    const users = await request('/api/users', { token })
    assert.equal(users.response.status, 200)
    assert.deepEqual(users.body.map((user) => user.username).sort(), ['api-admin', 'api-viewer'])
    const lastAdmin = await request(`/api/users/${admin.id}/role`, {
      method: 'PATCH', token, body: JSON.stringify({ role: 'viewer' }),
    })
    assert.equal(lastAdmin.response.status, 409)

    const updatedProfile = await request(`/api/profile/${admin.id}`, {
      method: 'PUT', body: JSON.stringify({ fullName: 'Updated Admin', class: 'IOT' }),
    })
    assert.equal(updatedProfile.response.status, 200)
    assert.equal(updatedProfile.body.fullName, 'Updated Admin')
    assert.equal(updatedProfile.body.class, 'IOT')
    const profile = await request(`/api/profile/${admin.id}`)
    assert.equal(profile.body.username, 'api-admin')

    const [[temperatureSensor]] = await db.execute('SELECT id FROM Sensor WHERE name = ?', ['DHT11 - Nhiệt độ'])
    assert.ok(temperatureSensor)
    for (const [value, recordedAt] of [[21, '2026-11-10 10:00:00'], [22, '2026-11-10 10:01:00']]) {
      const created = await request('/api/sensor-data', {
        method: 'POST', body: JSON.stringify({ sensor_id: temperatureSensor.id, value, recorded_at: recordedAt }),
      })
      assert.equal(created.response.status, 201)
      sensorRecordIds.push(created.body.id)
    }
    const filteredSensors = await request('/api/sensor-data?by=temperature&q=21&sort=oldest')
    assert.equal(filteredSensors.response.status, 200)
    assert.equal(filteredSensors.body.total, 1)
    assert.match(filteredSensors.body.data[0].value, /^21 /)
    const sensorPageOne = await request('/api/sensor-data?by=temperature&sort=oldest&page=1&limit=1')
    const sensorPageTwo = await request('/api/sensor-data?by=temperature&sort=oldest&page=2&limit=1')
    assert.equal(sensorPageOne.body.total, 2)
    assert.equal(sensorPageOne.body.data.length, 1)
    assert.equal(sensorPageTwo.body.data.length, 1)
    assert.notEqual(sensorPageOne.body.data[0].id, sensorPageTwo.body.data[0].id)

    const [[device]] = await db.execute('SELECT id, name FROM Device ORDER BY id LIMIT 1')
    assert.ok(device)
    for (let index = 0; index < 2; index += 1) {
      const [result] = await db.execute(
        "INSERT INTO ActionHistory (user_id, device_id, action, status) VALUES (?, ?, 'BẬT', 'THÀNH CÔNG')",
        [admin.id, device.id],
      )
      actionHistoryIds.push(result.insertId)
    }
    const historyUrl = `/api/activity-history?device=${encodeURIComponent(device.name)}&user=api-admin&status=${encodeURIComponent('THÀNH CÔNG')}&sort=oldest`
    const historyPageOne = await request(`${historyUrl}&page=1&limit=1`)
    const historyPageTwo = await request(`${historyUrl}&page=2&limit=1`)
    assert.equal(historyPageOne.body.total, 2)
    assert.equal(historyPageOne.body.data.length, 1)
    assert.equal(historyPageTwo.body.data.length, 1)
    assert.notEqual(historyPageOne.body.data[0].id, historyPageTwo.body.data[0].id)

    const sensorValidation = await request('/api/sensor-data?by=invalid')
    assert.equal(sensorValidation.response.status, 400)

    const missing = await request('/api/no-such-route')
    assert.equal(missing.response.status, 404)
    assert.match(missing.body.error, /GET \/api\/no-such-route/)
  } finally {
    try {
      if (actionHistoryIds.length) {
        const placeholders = actionHistoryIds.map(() => '?').join(', ')
        await db.execute(`DELETE FROM ActionHistory WHERE id IN (${placeholders})`, actionHistoryIds)
      }
      if (sensorRecordIds.length) {
        const placeholders = sensorRecordIds.map(() => '?').join(', ')
        await db.execute(`DELETE FROM DataSensor WHERE id IN (${placeholders})`, sensorRecordIds)
      }
      await db.execute('DELETE FROM `User` WHERE username IN (?, ?)', ['api-admin', 'api-viewer'])
    } finally {
      if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      await db.end()
    }
  }
})
