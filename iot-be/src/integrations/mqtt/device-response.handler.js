import { recordDeviceResponse } from '../../modules/devices.js'

export function handleDeviceResponse(payload) {
  const response = JSON.parse(payload.toString())
  recordDeviceResponse(response)
}
