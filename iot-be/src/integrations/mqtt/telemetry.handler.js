import { processTelemetry } from '../../modules/sensors.js'

export async function handleTelemetry(payload) {
  return processTelemetry(JSON.parse(payload.toString()))
}
