export function canControlDevices(role) {
  const normalized = String(role || '').trim().toLocaleLowerCase('vi')
  return [
    'admin',
    'operator',
    'quản trị viên',
    'người điều khiển',
    // Keep accounts created before role-based access was added operational.
    'người dùng',
  ].includes(normalized)
}

export function isAdmin(role) {
  return ['admin', 'quản trị viên'].includes(String(role || '').trim().toLocaleLowerCase('vi'))
}
