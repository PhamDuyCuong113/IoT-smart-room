import { saveVirtualAlerts } from '../../modules/virtual-alerts.js'

export async function handleVirtualAlerts(payload) {
  return saveVirtualAlerts(JSON.parse(payload.toString()))
}
