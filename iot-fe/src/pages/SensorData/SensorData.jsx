import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import PageHeading from '../../components/PageHeading'
import Pagination from '../../components/Pagination'
import { getSensorData, getSocketOrigin } from '../../api/client'
import './SensorData.css'

const searchOptions = [
  { value: 'all', label: 'Tất cả dữ liệu', placeholder: 'Nhập thời gian, giá trị hoặc tên thiết bị' },
  { value: 'time', label: 'Thời gian ghi nhận', placeholder: 'Nhập thời gian ghi nhận' },
  { value: 'light', label: 'Cảm biến ánh sáng', placeholder: 'Nhập giá trị ánh sáng' },
  { value: 'humidity', label: 'DHT11 - Độ ẩm', placeholder: 'Nhập giá trị độ ẩm' },
  { value: 'temperature', label: 'DHT11 - Nhiệt độ', placeholder: 'Nhập giá trị nhiệt độ' },
]

export default function SensorData() {
  const [query, setQuery] = useState('')
  const [searchBy, setSearchBy] = useState('all')
  const [filters, setFilters] = useState({ q: '', by: 'all' })
  const [sortOrder, setSortOrder] = useState('newest')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const refreshTimer = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    getSensorData({
      q: filters.q,
      by: filters.by,
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

  useEffect(() => {
    const socket = io(getSocketOrigin())
    let connectedOnce = false
    socket.on('connect', () => {
      if (connectedOnce) setRefreshKey((current) => current + 1)
      else connectedOnce = true
    })
    socket.on('sensor:new', () => {
      window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        setLoading(true)
        setError('')
        setRefreshKey((current) => current + 1)
      }, 300)
    })
    return () => {
      window.clearTimeout(refreshTimer.current)
      socket.disconnect()
    }
  }, [])

  function search(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setFilters({ q: query.trim(), by: searchBy })
    setPage(1)
  }

  return (
    <div className="sensor-page" aria-busy={loading}>
      <PageHeading title="Dữ liệu cảm biến" />
      <form className="panel filter-panel sensor-filters" onSubmit={search}>
        <div className="field sensor-search-field">
          <label htmlFor="sensor-query">Từ khóa tìm kiếm</label>
          <input
            id="sensor-query"
            className="input"
            placeholder={searchOptions.find((option) => option.value === searchBy).placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sensor-search-by">Tìm kiếm theo</label>
          <select id="sensor-search-by" className="input" value={searchBy}
            onChange={(event) => setSearchBy(event.target.value)}>
            {searchOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
          <button className="button button-primary" type="submit" disabled={loading}>
          Tìm kiếm
        </button>
        <div className="field sensor-sort-field">
          <label htmlFor="sensor-sort">Sắp xếp theo</label>
          <select id="sensor-sort" className="input" value={sortOrder}
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
      </form>
      {error && <p className="feedback feedback-error" role="alert">Không thể tải dữ liệu cảm biến: {error}</p>}
      <div className="panel table-panel sensor-table-panel">
        <table className="data-table sensor-table" aria-label="Dữ liệu cảm biến">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Dữ liệu nhận</th>
              <th scope="col">Thời gian ghi nhận</th>
              <th scope="col">Thiết bị</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="empty-state">Đang tải dữ liệu…</td></tr>
            ) : records.length ? (
              records.map((record) => (
                <tr key={record.id}>
                  <td>{record.id}</td>
                  <td>{record.value}</td>
                  <td className="muted">{record.time}</td>
                  <td>{record.device}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="empty-state">
                  {error ? 'Không có dữ liệu để hiển thị.' : 'Không tìm thấy dữ liệu phù hợp.'}
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
