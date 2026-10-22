import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import PageHeading from '../../components/PageHeading'
import Pagination from '../../components/Pagination'
import { getActivityHistory, getDashboard, getSocketOrigin } from '../../api/client'
import { formatDatabaseTimestamp, parseDate } from '../../utils/date'
import './ActivityHistory.css'

const initialFilters = {
  device: '',
  action: '',
  status: '',
  user: '',
  time: '',
}

function normalizeFromTimestamp(value) {
  const match = value.match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2})(?::(\d{2}))?)?$/)
  if (!match) return value
  return `${match[1]} ${match[2] ? `${match[2]}:${match[3] || '00'}` : '00:00:00'}`
}

export default function ActivityHistory() {
  const [draft, setDraft] = useState(initialFilters)
  const [filters, setFilters] = useState(initialFilters)
  const [sortOrder, setSortOrder] = useState('newest')
  const [error, setError] = useState('')
  const [deviceOptions, setDeviceOptions] = useState([])
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const socket = io(getSocketOrigin())
    let connectedOnce = false
    socket.on('connect', () => {
      if (connectedOnce) setRefreshKey((current) => current + 1)
      else connectedOnce = true
    })
    socket.on('activity:updated', () => setRefreshKey((current) => current + 1))
    return () => socket.disconnect()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getDashboard({ signal: controller.signal })
      .then((result) => setDeviceOptions(Array.isArray(result.devices) ? result.devices : []))
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setDeviceOptions([])
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getActivityHistory({
      device: filters.device,
      action: filters.action,
      status: filters.status,
      user: filters.user,
      from: filters.time,
      sort: sortOrder,
      page,
      limit: pageSize,
    }, { signal: controller.signal })
      .then((result) => {
        setRecords(Array.isArray(result.data) ? result.data : [])
        setTotal(Number(result.total) || 0)
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setRecords([])
          setTotal(0)
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [filters, sortOrder, page, pageSize, refreshKey])

  function change(event) {
    setDraft((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function search(event) {
    event.preventDefault()
    if (draft.time.trim() && parseDate(draft.time) === null) {
      setError('Nhập thời gian theo định dạng DD/MM/YYYY HH:mm:ss.')
      return
    }
    setLoading(true)
    setError('')
    setFilters({ ...draft, user: draft.user.trim(), time: normalizeFromTimestamp(draft.time.trim()) })
    setPage(1)
  }

  function reset() {
    setLoading(true)
    setDraft(initialFilters)
    setFilters(initialFilters)
    setSortOrder('newest')
    setPage(1)
    setError('')
  }

  return (
    <div className="history-page" aria-busy={loading}>
      <PageHeading title="Lịch sử hoạt động" />
      <form className="panel filter-panel history-filters" onSubmit={search}>
        <div className="field">
          <label htmlFor="history-device">Thiết bị</label>
          <select className="input" id="history-device" name="device" value={draft.device} onChange={change}>
            <option value="">Tất cả thiết bị</option>
            {deviceOptions.map((device) => (
              <option key={device.id} value={device.name}>{device.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-action">Thao tác</label>
          <select className="input" id="history-action" name="action" value={draft.action} onChange={change}>
            <option value="">Tất cả thao tác</option>
            <option value="BẬT">Bật</option>
            <option value="TẮT">Tắt</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-status">Trạng thái</label>
          <select className="input" id="history-status" name="status" value={draft.status} onChange={change}>
            <option value="">Tất cả trạng thái</option>
            <option value="THÀNH CÔNG">Thành công</option>
            <option value="THẤT BẠI">Thất bại</option>
            <option value="LOADING">Loading</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="history-user">Người thực hiện</label>
          <input className="input" id="history-user" name="user" placeholder="Nhập tên người thực hiện"
            value={draft.user} onChange={change} />
        </div>
        <div className="field history-time">
          <label htmlFor="history-time">Tìm kiếm theo thời gian</label>
          <input className="input" id="history-time" name="time" value={draft.time} onChange={change}
            placeholder="DD/MM/YYYY HH:mm:ss" aria-invalid={Boolean(error)}
            aria-describedby={error ? 'history-error' : undefined} />
        </div>
        <button className="button button-primary history-search-button" type="submit" disabled={loading}>Tìm kiếm</button>
        <div className="field history-sort-field">
          <label htmlFor="history-sort">Sắp xếp theo</label>
          <select className="input" id="history-sort" value={sortOrder}
            onChange={(event) => {
              setLoading(true)
              setError('')
              setSortOrder(event.target.value)
              setPage(1)
            }}>
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
          </select>
        </div>
        <button className="button history-reset-button" type="button" onClick={reset}>Đặt lại</button>
        {error && (
          <p className="feedback feedback-error history-error" id="history-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="panel table-panel history-table-panel">
        <table className="data-table history-table" aria-label="Lịch sử hoạt động">
          <thead>
            <tr>
              {['ID', 'Tên thiết bị', 'Thao tác', 'Trạng thái thực hiện', 'Người thực hiện', 'Thời gian ghi nhận'].map((title) => (
                <th key={title} scope="col">{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="empty-state">Đang tải lịch sử…</td></tr>
            ) : records.length ? (
              records.map((record) => (
                <tr key={record.id}>
                  <td className="muted">{record.id}</td>
                  <td><strong>{record.device}</strong></td>
                  <td>
                    <span className={`badge ${record.action === 'BẬT' ? 'badge-on' : ''}`}>
                      {record.action}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${record.status === 'THÀNH CÔNG' ? 'badge-success' : record.status === 'THẤT BẠI' ? 'badge-failure' : record.status === 'LOADING' ? 'badge-loading' : ''}`}>
                      {record.status === 'LOADING' ? 'Loading' : record.status}
                    </span>
                  </td>
                  <td>{record.user}</td>
                  <td className="muted">{formatDatabaseTimestamp(record.time)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty-state">
                  {error ? 'Không thể tải lịch sử hoạt động.' : 'Không tìm thấy hoạt động phù hợp.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(nextPage) => {
          if (nextPage !== page) {
            setLoading(true)
            setError('')
            setPage(nextPage)
          }
        }}
        onPageSizeChange={(size) => {
          setLoading(true)
          setError('')
          setPageSize(size)
          setPage(1)
        }}
      />
    </div>
  )
}
