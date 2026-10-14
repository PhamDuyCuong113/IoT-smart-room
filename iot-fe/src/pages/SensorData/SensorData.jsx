import { useState } from 'react'
import PageHeading from '../../components/PageHeading'
import Pagination from '../../components/Pagination'
import { sensorRecords } from '../../data/mockData'
import { parseDate } from '../../utils/date'
import './SensorData.css'

const searchOptions = [
  { value: 'all', label: 'Tất cả dữ liệu', placeholder: 'Nhập thời gian, giá trị hoặc tên thiết bị' },
  { value: 'time', label: 'Thời gian ghi nhận', placeholder: 'VD: 07/10/2026 10:45:00' },
  { value: 'value', label: 'Dữ liệu nhận', placeholder: 'VD: 27.4, 68 % hoặc 1250 lux' },
  { value: 'device', label: 'Tên thiết bị', placeholder: 'VD: Nhiệt độ, Độ ẩm hoặc Ánh sáng' },
  { value: 'id', label: 'ID', placeholder: 'Nhập ID bản ghi, VD: 219' },
]

function normalizeSearch(value) {
  return String(value).toLocaleLowerCase('vi').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd')
}

export default function SensorData() {
  const [query, setQuery] = useState('')
  const [searchBy, setSearchBy] = useState('all')
  const [sortOrder, setSortOrder] = useState('all')
  const [filters, setFilters] = useState({ query: '', searchBy: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const searchText = normalizeSearch(filters.query)
  const filtered = sensorRecords.filter((record) => {
    if (!searchText) return true
    if (filters.searchBy === 'id') return String(record.id) === searchText
    const values = filters.searchBy === 'all'
      ? [record.time, record.value, record.device, record.id]
      : [record[filters.searchBy]]
    return values.some((value) => normalizeSearch(value).includes(searchText))
  }).sort((left, right) => {
    if (sortOrder === 'all') return 0
    const comparison = parseDate(left.time) - parseDate(right.time) || left.id - right.id
    return sortOrder === 'newest' ? -comparison : comparison
  })
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  function search(event) {
    event.preventDefault()
    setFilters({ query: query.trim(), searchBy })
    setPage(1)
  }
  return (
    <div className="sensor-page">
      <PageHeading
        title="Dữ liệu cảm biến"
      />
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
        <button className="button button-primary" type="submit">
          Tìm kiếm
        </button>
        <div className="field sensor-sort-field">
          <label htmlFor="sensor-sort">Sắp xếp theo</label>
          <select id="sensor-sort" className="input" value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value)
              setPage(1)
            }}>
            
            <option value="newest">Mới nhất</option>
            <option value="oldest">Cũ nhất</option>
          </select>
        </div>
      </form>
      <div className="panel table-panel sensor-table-panel">
        <table
          className="data-table sensor-table"
          aria-label="Dữ liệu cảm biến"
        >
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">Dữ liệu nhận</th>
              <th scope="col">Thời gian ghi nhận</th>
              <th scope="col">Thiết bị</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((record) => (
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
                  Không tìm thấy dữ liệu phù hợp.
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
