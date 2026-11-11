import { canControlDevices, isAdmin } from '../shared/security/roles.js'

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user?.role)) {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới được thay đổi phân quyền.' })
  }
  return next()
}

export function requireDeviceControl(req, res, next) {
  if (!canControlDevices(req.user?.role)) {
    return res.status(403).json({ error: 'Tài khoản của bạn chỉ có quyền xem, chưa được phép điều khiển thiết bị.' })
  }
  return next()
}
