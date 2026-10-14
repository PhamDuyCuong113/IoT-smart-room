import { useState } from 'react'
import PageHeading from '../../components/PageHeading'
import { readProfile, saveProfile } from '../../utils/storage'
import profilePhoto from '../../assets/B23DCCN113.jpg'
import './Profile.css'

const links = [
  { key: 'github', label: 'Link Github:' },
  { key: 'figma', label: 'Link Figma:' },
  { key: 'report', label: 'Link báo cáo:' },
  { key: 'postman', label: 'Link Postman:' },
]

export default function Profile() {
  const [profile, setProfile] = useState(readProfile)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
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
                    value={profile.role}
                    readOnly
                  />
                </div>
              </div>
            </div>
          </section>
          <section className="panel profile-links" aria-label="Liên kết dự án">
            {links.map((link) => (
              <div className="profile-link-field" key={link.key}>
                <label htmlFor={link.key}>{link.label}</label>
                <input
                  id={link.key}
                  name={link.key}
                  type="url"
                  value={profile[link.key]}
                  onChange={change}
                />
              </div>
            ))}
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
    </div>
  )
}
