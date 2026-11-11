import test from 'node:test'
import assert from 'node:assert/strict'
import { dailyRange, validateVirtualAlerts } from '../../src/modules/virtual-alerts.js'

const snapshot = () => ({
  esp32Id: 'test-device',
  date: '20261104',
  timeSynced: true,
  leds: [25, 26, 27].map((pin, index) => ({
    sensorId: `sensor${index + 1}`,
    pin,
    y: 100,
    threshold: 50,
    sensorValue: 49 + index,
    alertActive: index === 2,
    hardwareLedOn: index === 2,
    alertsToday: 0,
  })),
})

test('virtual alert payload and day ranges retain the device contract', () => {
  assert.equal(validateVirtualAlerts(snapshot()).date, '2026-11-04')
  for (const mutate of [
    (data) => { data.leds.pop() },
    (data) => { data.leds[0].sensorId = 'sensor2' },
    (data) => { data.leds[0].sensorValue = 100 },
    (data) => { data.leds[0].threshold = 60 },
    (data) => { data.leds[0].alertActive = true },
    (data) => { data.leds[0].hardwareLedOn = true },
    (data) => { data.leds[0].alertsToday = -1 },
    (data) => { data.leds[0].alertActive = 'false' },
    (data) => { data.date = '20260230' },
  ]) {
    const invalid = snapshot()
    mutate(invalid)
    assert.throws(() => validateVirtualAlerts(invalid))
  }
  assert.equal(validateVirtualAlerts({ ...snapshot(), timeSynced: false, date: '' }).date, null)
  assert.throws(() => dailyRange('2026-10-01', '2026-11-01'))
  assert.throws(() => dailyRange('2026-11-05', '2026-11-04'))
  assert.throws(() => dailyRange('2026-02-30', '2026-03-01'))
  assert.deepEqual(dailyRange('2026-11-01', '2026-11-30'), { from: '2026-11-01', to: '2026-11-30' })
})
