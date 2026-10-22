import { useEffect, useState } from 'react'
import PageHeading from '../../components/PageHeading'
import { readProfile, saveProfile } from '../../utils/storage'
import { getApiDocsUrl, getUsers, updateUserRole } from '../../api/client'
import { isAdmin, roleKey, roleLabel } from '../../utils/roles'
import profilePhoto from '../../assets/B23DCCN113.jpg'
import './Profile.css'

const links = [
  { key: 'github', label: 'Link Github:' },
  { key: 'figma', label: 'Link Figma:' },
  { key: 'report', label: 'Link báo cáo:' },
  { key: 'swagger', label: 'Link Swagger:' },
]

function safeExternalUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export default function Profile({ currentUser, onCurrentUserChange }) {
  const [profile, setProfile] = useState(() => {
    const saved = readProfile()
    return {
      ...saved,
      fullName: currentUser?.fullName || saved.fullName,
      username: currentUser?.username || saved.username,
      swagger: saved.swagger || getApiDocsUrl(),
    }
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [roleError, setRoleError] = useState('')
  const [updatingUser, setUpdatingUser] = useState(null)
  const admin = isAdmin(currentUser?.role)

  useEffect(() => {
    if (!admin) return undefined
    const controller = new AbortController()
    setUsersLoading(true)
    getUsers({ signal: controller.signal })
      .then((result) => setUsers(Array.isArray(result) ? result : []))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setRoleError(requestError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setUsersLoading(false)
      })
    return () => controller.abort()
  }, [admin])

  async function changeRole(event, user) {
    const role = event.target.value
    setUpdatingUser(user.id)
    setRoleError('')
    try {
      const updated = await updateUserRole(user.id, role)
      setUsers((current) => current.map((item) => Number(item.id) === Number(updated.id) ? updated : item))
      if (Number(currentUser?.id) === Number(updated.id)) {
        onCurrentUserChange?.({ ...currentUser, role: updated.role })
      }
    } catch (requestError) {
      setRoleError(requestError.message)
    } finally {
      setUpdatingUser(null)
    }
  }
  function change(event) {
    setProfile({ ...profile, [event.target.name]: event.target.value })
    setMessage('')
  }
  function save(event) {
    event.preventDefault()
    const fullName = profile.fullName.trim()
    const username = profile.username.trim()
    if (!fullName || !username) {
      setError(true)
      setMessage('Vui lòng nhập họ tên và tên người dùng.')
      return
    }
    const saved = saveProfile({ ...profile, fullName, username })
    setError(!saved)
    setMessage(
      saved
        ? 'Đã lưu thông tin hồ sơ.'
        : 'Không thể lưu trên trình duyệt này. Vui lòng kiểm tra quyền lưu trữ.',
    )
  }
  return (
    <div className="profile-page">
      <PageHeading
        title="Hồ sơ & cấu hình"
        description="Quản lý thông tin người điều khiển và các liên kết dự án."
      />
      <form onSubmit={save}>
        <div className="profile-grid">
          <section className="panel user-panel">
            <h2>Thông tin người dùng</h2>
            <p>Thông tin người điều khiển thiết bị trong lịch sử hoạt động</p>
            <div className="profile-user-content">
              <img
                className="profile-photo"
                src={profilePhoto}
                alt="Ảnh đại diện người dùng"
                width={120}
                height={180}
                decoding="async"
              />
              <div className="profile-fields">
                <div className="field">
                  <label htmlFor="full-name">Họ và tên</label>
                  <input
                    className="input"
                    id="full-name"
                    name="fullName"
                    value={profile.fullName}
                    onChange={change}
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="username">Tên người dùng</label>
                  <input
                    className="input"
                    id="username"
                    name="username"
                    value={profile.username}
                    onChange={change}
                    autoComplete="nickname"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="role">Vai trò</label>
                  <input
                    className="input"
                    id="role"
                    value={roleLabel(currentUser?.role || profile.role)}
                    readOnly
                  />
                </div>
              </div>
            </div>
          </section>
          <section className="panel profile-links" aria-label="Liên kết dự án">
            {links.map((link) => {
              const href = safeExternalUrl(profile[link.key])
              return (
                <div className="profile-link-field" key={link.key}>
                  <label htmlFor={link.key}>{link.label}</label>
                  <input
                    id={link.key}
                    name={link.key}
                    type="url"
                    value={profile[link.key]}
                    onChange={change}
                  />
                  {href && (
                    <a className="profile-link-open" href={href} target="_blank" rel="noopener noreferrer"
                      aria-label={`Mở ${link.label.replace(':', '')} trên trình duyệt`}>
                      Mở <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              )
            })}
          </section>
        </div>
        <div className="profile-actions">
          {message && (
            <p
              className={`feedback ${error ? 'feedback-error' : ''}`}
              role={error ? 'alert' : 'status'}
            >
              {message}
            </p>
          )}
          <button className="button button-primary" type="submit">
            Lưu
          </button>
        </div>
      </form>
      {admin && (
        <section className="panel role-management">
          <div className="role-management-heading">
            <div>
              <h2>Quản lý quyền truy cập</h2>
              <p>Chỉ người điều khiển và quản trị viên mới được bật hoặc tắt thiết bị.</p>
            </div>
            <span className="role-chip">Quản trị viên</span>
          </div>
          {roleError && <p className="feedback feedback-error" role="alert">{roleError}</p>}
          <div className="table-panel">
            <table className="data-table role-table" aria-label="Danh sách tài khoản và vai trò">
              <thead>
                <tr><th scope="col">Tài khoản</th><th scope="col">Tên hiển thị</th><th scope="col">Vai trò</th></tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td colSpan={3} className="empty-state">Đang tải tài khoản…</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.username}</strong>{Number(user.id) === Number(currentUser?.id) && <span className="muted"> · Bạn</span>}</td>
                    <td>{user.fullName}</td>
                    <td>
                      <select
                        className="input role-select"
                        aria-label={`Vai trò của ${user.username}`}
                        value={roleKey(user.role)}
                        disabled={updatingUser === user.id}
                        onChange={(event) => changeRole(event, user)}
                      >
                        <option value="admin">Quản trị viên</option>
                        <option value="operator">Người điều khiển</option>
                        <option value="viewer">Chỉ xem</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {!usersLoading && users.length === 0 && !roleError && (
                  <tr><td colSpan={3} className="empty-state">Chưa có tài khoản.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
