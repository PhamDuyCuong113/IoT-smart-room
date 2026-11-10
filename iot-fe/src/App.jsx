import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard/Dashboard'
import SensorData from './pages/SensorData/SensorData'
import ActivityHistory from './pages/ActivityHistory/ActivityHistory'
import Profile from './pages/Profile/Profile'
import AuthPage from './pages/Auth/AuthPage'
import BlinkCounts from './pages/BlinkCounts/BlinkCounts'
import { clearAuthToken, getAuthToken, getCurrentUser } from './api/client'
import { canControlDevices } from './utils/roles'
import './App.css'

const routes = {
  '/dashboard': { component: Dashboard, title: 'Dashboard' },
  '/sensor-data': { component: SensorData, title: 'Dữ liệu cảm biến' },
  '/activity-history': { component: ActivityHistory, title: 'Lịch sử hoạt động' },
  '/blink-counts': { component: BlinkCounts, title: 'Đếm nháy đèn' },
  '/profile': { component: Profile, title: 'Hồ sơ' },
}

function getPath() {
  return window.location.hash.slice(1).split('?')[0] || '/dashboard'
}

export default function App() {
  const [path, setPath] = useState(getPath)
  const [menuOpen, setMenuOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(Boolean(getAuthToken()))
  const route = routes[path]

  useEffect(() => {
    const handleRoute = () => {
      setPath(getPath())
      setMenuOpen(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', handleRoute)
    return () => window.removeEventListener('hashchange', handleRoute)
  }, [])

  useEffect(() => {
    const token = getAuthToken()
    if (!token) return
    const controller = new AbortController()
    getCurrentUser({ signal: controller.signal })
      .then(setUser)
      .catch(() => clearAuthToken())
      .finally(() => {
        if (!controller.signal.aborted) setCheckingAuth(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const expireSession = () => {
      setUser(null)
      setCheckingAuth(false)
    }
    window.addEventListener('smart-room-auth-expired', expireSession)
    return () => window.removeEventListener('smart-room-auth-expired', expireSession)
  }, [])

  useEffect(() => {
    document.title = `${route?.title || 'Không tìm thấy trang'} | SMART ROOM`
  }, [route])

  function authenticate(nextUser) {
    setUser(nextUser)
    if (path === '/login') window.location.hash = '#/dashboard'
  }

  function logout() {
    clearAuthToken()
    setUser(null)
    setPath('/login')
    window.location.hash = '#/login'
  }

  if (checkingAuth) return <main className="auth-checking" aria-live="polite">Đang kiểm tra phiên đăng nhập…</main>
  if (!user) return <AuthPage onAuthenticated={authenticate} />

  const Page = route?.component
  const canControl = canControlDevices(user.role)

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >
        Đi đến nội dung
      </a>
      <header className="site-header">
        <a className="brand" href="#/dashboard">SMART ROOM</a>
        <button
          className="nav-toggle"
          type="button"
          aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>
        <nav
          id="main-navigation"
          className={`main-nav ${menuOpen ? 'is-open' : ''}`}
          aria-label="Điều hướng chính"
        >
          {Object.entries(routes).map(([href, item]) => (
            <a
              key={href}
              href={`#${href}`}
              className={path === href ? 'active' : ''}
              aria-current={path === href ? 'page' : undefined}
            >
              {item.title}
            </a>
          ))}
        </nav>
        <div className="header-account">
          <button className="logout-button" type="button" onClick={logout}>Đăng xuất</button>
        </div>
      </header>
      <main
        id="main-content"
        className={`main-content ${path === '/dashboard' ? 'dashboard-main' : ''}`}
        tabIndex={-1}
      >
        {Page ? (
          <Page
            currentUser={user}
            canControlDevices={canControl}
            onCurrentUserChange={setUser}
          />
        ) : (
          <div className="not-found">
            <h1>Không tìm thấy trang</h1>
            <p>Trang bạn đang tìm không tồn tại.</p>
            <a className="button button-primary" href="#/dashboard">Về Dashboard</a>
          </div>
        )}
      </main>
    </>
  )
}
