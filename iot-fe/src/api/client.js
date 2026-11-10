const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api')
  .replace(/\/+$/, '')
const authTokenKey = 'smart-room-auth-token'

export function getAuthToken() {
  try {
    return localStorage.getItem(authTokenKey)
  } catch {
    return null
  }
}

export function saveAuthToken(token) {
  try {
    localStorage.setItem(authTokenKey, token)
  } catch {
    throw new Error('Không thể lưu phiên đăng nhập trên trình duyệt này.')
  }
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(authTokenKey)
  } catch {
    // Clear app state even when browser storage is unavailable.
  }
}

export function getSocketOrigin() {
  return new URL(API_BASE_URL, window.location.origin).origin
}

export function getApiDocsUrl() {
  return `${new URL(API_BASE_URL, window.location.origin).origin}/api-docs`
}

async function request(path, { signal, ...options } = {}) {
  const headers = new Headers(options.headers)
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, signal })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/register')) {
      clearAuthToken()
      window.dispatchEvent(new Event('smart-room-auth-expired'))
    }
    const error = new Error(body.error || `Yêu cầu thất bại (HTTP ${response.status}).`)
    error.status = response.status
    throw error
  }
  return body
}

function queryString(parameters) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }
  return query.toString()
}

export function getDashboard({ signal } = {}) {
  return request('/dashboard', { signal })
}

export function login(credentials) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) })
}

export function register(account) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(account) })
}

export function getCurrentUser({ signal } = {}) {
  return request('/auth/me', { signal })
}

export function getUsers({ signal } = {}) {
  return request('/users', { signal })
}

export function updateUserRole(id, role) {
  return request(`/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  })
}

export function getSensorData(parameters, { signal } = {}) {
  return request(`/sensor-data?${queryString(parameters)}`, { signal })
}

export function getActivityHistory(parameters, { signal } = {}) {
  return request(`/activity-history?${queryString(parameters)}`, { signal })
}

export function setDeviceStatus(id, status) {
  return request(`/devices/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export function getVirtualAlerts({ signal } = {}) {
  return request('/virtual-alerts', { signal })
}

export function getVirtualAlertDaily(parameters, { signal } = {}) {
  return request(`/virtual-alerts/daily?${queryString(parameters)}`, { signal })
}
