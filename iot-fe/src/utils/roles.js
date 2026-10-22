const adminRoles = new Set(['admin', 'quản trị viên'])
const operatorRoles = new Set(['operator', 'người điều khiển', 'người dùng'])

function normalizeRole(role) {
  return String(role || '').trim().toLocaleLowerCase('vi')
}

export function canControlDevices(role) {
  const value = normalizeRole(role)
  return adminRoles.has(value) || operatorRoles.has(value)
}

export function isAdmin(role) {
  return adminRoles.has(normalizeRole(role))
}

export function roleKey(role) {
  const value = normalizeRole(role)
  if (adminRoles.has(value)) return 'admin'
  if (operatorRoles.has(value)) return 'operator'
  return 'viewer'
}

export function roleLabel(role) {
  const value = roleKey(role)
  if (value === 'admin') return 'Quản trị viên'
  if (value === 'operator') return 'Người điều khiển'
  return 'Chỉ xem'
}
