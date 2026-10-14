export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const visiblePages = [...new Set([1, pageCount, page - 1, page, page + 1])]
    .filter((number) => number >= 1 && number <= pageCount)
    .sort((a, b) => a - b)
  return (
    <div className="pagination">
      <label className="page-size">
        Hiển thị
        <select
          className="input"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label="Số bản ghi mỗi trang"
        >
          {[5, 8, 10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        bản ghi
      </label>
      <nav className="page-buttons" aria-label="Phân trang">
        <button
          className="button"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          Trước
        </button>
        {visiblePages.map(
          (number, index) => (
            <span className="page-item" key={number}>
            {index > 0 && number - visiblePages[index - 1] > 1 && <span className="page-ellipsis" aria-hidden="true">…</span>}
            <button
              key={number}
              className={`button page-number ${page === number ? 'button-primary' : ''}`}
              aria-label={`Trang ${number}`}
              aria-current={page === number ? 'page' : undefined}
              onClick={() => onPageChange(number)}
            >
              {number}
            </button>
            </span>
          ),
        )}
        <button
          className="button"
          disabled={page === pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Sau
        </button>
      </nav>
    </div>
  )
}
