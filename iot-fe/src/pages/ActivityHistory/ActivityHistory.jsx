import { useState } from 'react'
import PageHeading from '../../components/PageHeading'
import Pagination from '../../components/Pagination'
import { useMockRoom } from '../../data/useMockRoom'
import { parseDate } from '../../utils/date'
import './ActivityHistory.css'

const initialFilters = {
  device: '',
  action: '',
  status: '',
  user: '',
  time: '',
}

export default function ActivityHistory() {
  const { activities: activityRecords } = useMockRoom()
  const [draft, setDraft] = useState(initialFilters)
  const [filters, setFilters] = useState(initialFilters)
  const [sortOrder, setSortOrder] = useState('newest')
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const filtered = activityRecords.filter(
    (record) =>
      (!filters.device || record.device === filters.device) &&
      (!filters.action || record.action === filters.action) &&
      (!filters.status || record.status === filters.status) &&
      (!filters.user ||
        record.user
          .toLocaleLowerCase('vi')
          .includes(filters.user.toLocaleLowerCase('vi'))) &&
      (!filters.time || parseDate(record.time) >= parseDate(filters.time)),
  ).sort((left, right) => {
    const comparison = parseDate(left.time) - parseDate(right.time) || left.id - right.id
    return sortOrder === 'newest' ? -comparison : comparison
  })
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  function change(event) {
    setDraft({ ...draft, [event.target.name]: event.target.value })
  }
  function search(event) {
    event.preventDefault()
    if (draft.time.trim() && parseDate(draft.time) === null) {
      setError(
        'Nhập thời gian theo định dạng DD/MM/YYYY HH:mm:ss, ví dụ 07/10/2026 00:00:00.',
      )
      return
    }
    setError('')
    setFilters({ ...draft, user: draft.user.trim(), time: draft.time.trim() })
    setPage(1)
  }
  function reset() {
    setDraft(initialFilters)
    setFilters(initialFilters)
    setSortOrder('newest')
    setPage(1)
    setError('')
  }
  return (
    <div className="history-page">
      <PageHeading
        title="Lịch sử hoạt động"
      />
      <form className="panel filter-panel history-filters" onSubmit={search}>
        <div className="field">
          <label htmlFor="history-device">Thiết bị</label>
          <select
            className="input"
            id="history-device"
            name="device"
            value={draft.device}
            onChange={change}
          >
            <option value="">Tất cả thiết bị</option>
            {['Điều hòa', 'Đèn', 'Quạt'].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-action">Thao tác</label>
          <select
            className="input"
            id="history-action"
            name="action"
            value={draft.action}
            onChange={change}
          >
            <option value="">Tất cả thao tác</option>
            <option value="BẬT">Bật</option>
            <option value="TẮT">Tắt</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-status">Trạng thái</label>
          <select
            className="input"
            id="history-status"
            name="status"
            value={draft.status}
            onChange={change}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="THÀNH CÔNG">Thành công</option>
            <option value="THẤT BẠI">Thất bại</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-user">Người thực hiện</label>
          <input
            className="input"
            id="history-user"
            name="user"
            placeholder="Nhập tên người thực hiện"
            value={draft.user}
            onChange={change}
          />
        </div>
        <div className="field history-time">
          <label htmlFor="history-time">Thời gian</label>
          <input
            className="input"
            id="history-time"
            name="time"
            value={draft.time}
            onChange={change}
            placeholder="DD/MM/YYYY HH:mm:ss"
            aria-invalid={!!error}
            aria-describedby={error ? 'history-error' : undefined}
          />
        </div>
        <div className="field history-sort-field">
          <label htmlFor="history-sort">Sắp xếp theo</label>
          <select
            className="input"
            id="history-sort"
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value)
              setPage(1)
            }}
          >
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
          </select>
        </div>
        <div className="history-filter-actions">
          <button className="button button-primary" type="submit">
            Tìm kiếm
          </button>
          <button className="button" type="button" onClick={reset}>
            Đặt lại
          </button>
        </div>
        {error && (
          <p
            className="feedback feedback-error history-error"
            id="history-error"
            role="alert"
          >
            {error}
          </p>
        )}
      </form>
      <div className="panel table-panel history-table-panel">
        <table
          className="data-table history-table"
          aria-label="Lịch sử hoạt động"
        >
          <thead>
            <tr>
              {[
                'ID',
                'Tên thiết bị',
                'Thao tác',
                'Trạng thái thực hiện',
                'Người thực hiện',
                'Thời gian ghi nhận',
              ].map((title) => (
                <th key={title} scope="col">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((record) => (
                <tr key={record.id}>
                  <td className="muted">{record.id}</td>
                  <td>
                    <strong>{record.device}</strong>
                  </td>
                  <td>
                    <span className={`badge ${record.action === 'BẬT' ? 'badge-on' : ''}`}>
                      {record.action}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${record.status === 'THÀNH CÔNG' ? 'badge-success' : record.status === 'THẤT BẠI' ? 'badge-failure' : ''}`}
                    >
                      {record.status}
                    </span>
                  </td>
                  <td>{record.user}</td>
                  <td className="muted">{record.time}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-state">
                  Không tìm thấy hoạt động phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />
    </div>
  )
}
