import { useEffect, useState } from 'react'
import PageHeading from '../../components/PageHeading'
import Pagination from '../../components/Pagination'
import { getSensorData } from '../../api/client'
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
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

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
        if (controller.signal.aborted) return
        setRecords(Array.isArray(result.data) ? result.data : [])
        setTotal(Number(result.total) || 0)
        setHasLoaded(true)
        setError('')
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError.name !== 'AbortError') {
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [filters, sortOrder, page, pageSize, refreshKey])

  function search(event) {
    event.preventDefault()
    setLoading(true)
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
          <div className="sensor-sort-controls">
            <select id="sensor-sort" className="input" value={sortOrder}
              onChange={(event) => {
                setLoading(true)
                setSortOrder(event.target.value)
                setPage(1)
              }}>
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
            </select>
            <button className="button sensor-reload" type="button"
              title="Tải lại dữ liệu" aria-label="Tải lại dữ liệu" disabled={loading}
              onClick={() => {
                setLoading(true)
                setRefreshKey((current) => current + 1)
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true" focusable="false">
                <path d="M20 7v5h-5" />
                <path d="M20 12a8 8 0 1 0-2.34 5.66M20 7v5" />
              </svg>
            </button>
          </div>
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
            {loading && !hasLoaded ? (
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
            setPage(nextPage)
          }
        }}
        onPageSizeChange={(size) => {
          if (size === pageSize) return
          setLoading(true)
          setPageSize(size)
          setPage(1)
        }}
      />
    </div>
  )
}
