import { useState } from 'react'
import { login, register, saveAuthToken } from '../../api/client'
import './AuthPage.css'

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ fullName: '', username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isRegistering = mode === 'register'

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (isRegistering) {
        await register({ ...form, username: form.username.trim() })
      }
      const session = await login({ username: form.username.trim(), password: form.password })
      saveAuthToken(session.token)
      onAuthenticated(session.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <p className="auth-kicker">KHÔNG GIAN ĐIỀU KHIỂN CỦA BẠN</p>
          <h2>{isRegistering ? 'Tạo tài khoản' : 'Đăng nhập'}</h2>
          <p className="auth-intro">
            {isRegistering
              ? 'Tạo tài khoản để bắt đầu kết nối với căn phòng thông minh.'
              : 'Nhập thông tin tài khoản để tiếp tục vào hệ thống.'}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {isRegistering && (
              <div className="field">
                <label htmlFor="auth-full-name">Họ và tên</label>
                <input className="input" id="auth-full-name" name="fullName" value={form.fullName}
                  onChange={change} autoComplete="name" placeholder="Tên hiển thị của bạn" required />
              </div>
            )}
            <div className="field">
              <label htmlFor="auth-username">Tên đăng nhập</label>
              <input className="input" id="auth-username" name="username" value={form.username}
                onChange={change} autoComplete="username" placeholder="Nhập tên đăng nhập" required />
            </div>
            <div className="field">
              <label htmlFor="auth-password">Mật khẩu</label>
              <input className="input" id="auth-password" name="password" type="password" value={form.password}
                onChange={change} autoComplete={isRegistering ? 'new-password' : 'current-password'}
                placeholder={isRegistering ? 'Ít nhất 6 ký tự' : 'Nhập mật khẩu'} minLength={isRegistering ? 6 : undefined} required />
            </div>
            {error && <p className="feedback feedback-error auth-error" role="alert">{error}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy ? 'Đang xử lý…' : isRegistering ? 'Tạo tài khoản' : 'Đăng nhập'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          </form>

          {isRegistering && (
          <p className="auth-role-note">Nếu hệ thống chưa có tài khoản, tài khoản đầu tiên sẽ là Quản trị viên. Các tài khoản tạo sau mặc định chỉ xem; quản trị viên có thể cấp quyền điều khiển.</p>
          )}
          <p className="auth-switch">
            {isRegistering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
            <button type="button" onClick={() => { setMode(isRegistering ? 'login' : 'register'); setError('') }}>
              {isRegistering ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </p>
          <p className="auth-security"><span aria-hidden="true">◈</span> Quyền truy cập thiết bị được bảo vệ theo vai trò tài khoản</p>
        </div>
      </section>
    </main>
  )
}
