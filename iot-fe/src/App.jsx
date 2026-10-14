import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard/Dashboard'
import SensorData from './pages/SensorData/SensorData'
import ActivityHistory from './pages/ActivityHistory/ActivityHistory'
import Profile from './pages/Profile/Profile'
import './App.css'


const routes = {
  '/dashboard': { component: Dashboard, title: 'Dashboard' },
  '/sensor-data': { component: SensorData, title: 'Dữ liệu cảm biến' },
  '/activity-history': {
    component: ActivityHistory,
    title: 'Lịch sử hoạt động',
  },
  '/profile': { component: Profile, title: 'Hồ sơ' },
}

function getPath() {
  return window.location.hash.slice(1).split('?')[0] || '/dashboard'
}

function App() {
  const [path, setPath] = useState(getPath)
  const [menuOpen, setMenuOpen] = useState(false)
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
    document.title = `${route?.title || 'Không tìm thấy trang'} | SMART ROOM`
  }, [route])

  const Page = route?.component
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content').focus()
        }}
      >
        Đi đến nội dung
      </a>
      <header className="site-header">
        <a className="brand" href="#/dashboard">
          SMART ROOM
        </a>
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
      </header>
      <main
        id="main-content"
        className={`main-content ${path === '/dashboard' ? 'dashboard-main' : ''}`}
        tabIndex={-1}
      >
        {Page ? (
          <Page />
        ) : (
          <div className="not-found">
            <h1>Không tìm thấy trang</h1>
            <p>Trang bạn đang tìm không tồn tại.</p>
            <a className="button button-primary" href="#/dashboard">
              Về Dashboard
            </a>
          </div>
        )}
      </main>
    </>
  )
}

export default App
