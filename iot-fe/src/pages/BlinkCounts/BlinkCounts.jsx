import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import PageHeading from '../../components/PageHeading'
import { getVirtualAlerts, getVirtualAlertDaily, getSocketOrigin } from '../../api/client'
import './BlinkCounts.css'

const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
const weekStart = () => new Date(Date.parse(today()) - 6 * 86400000).toISOString().slice(0, 10)
const dateLabel = (date) => date.split('-').reverse().join('/')
const emptyLeds = [25, 26, 27].map((pin, index) => ({
  sensorId: `sensor${index + 1}`, name: `Cảm biến ảo ${index + 1}`, pin,
  hasData: false, sensorValue: null, y: 100, threshold: 50,
}))

export default function BlinkCounts() {
  const [leds, setLeds] = useState(emptyLeds)
  const [daily, setDaily] = useState([])
  const [filters, setFilters] = useState(() => ({ from: weekStart(), to: today() }))
  const [draft, setDraft] = useState(filters)
  const [refresh, setRefresh] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [loading, setLoading] = useState(true)
  const [dailyLoading, setDailyLoading] = useState(true)
  const [error, setError] = useState('')
  const [dailyError, setDailyError] = useState('')
  const [filterError, setFilterError] = useState('')

  useEffect(() => {
    const socket = io(getSocketOrigin())
    const reload = () => setRefresh((value) => value + 1)
    socket.on('connect', reload)
    socket.on('virtual-alerts:updated', (event) => {
      if (event.esp32Id === 'ESP32-01') reload()
    })
    // Only update the stale-data indicator; this timer does not fetch data.
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(timer); socket.disconnect() }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getVirtualAlerts({ signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      setLeds(result.leds)
      setNow(Date.now())
      setError('')
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(requestError.message)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    const controller = new AbortController()
    getVirtualAlertDaily(filters, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      setDaily(result.data)
      setDailyError('')
    }).catch((requestError) => {
      if (!controller.signal.aborted) setDailyError(requestError.message)
    }).finally(() => {
      if (!controller.signal.aborted) setDailyLoading(false)
    })
    return () => controller.abort()
  }, [filters, refresh])

  function search(event) {
    event.preventDefault()
    const days = (Date.parse(draft.to) - Date.parse(draft.from)) / 86400000
    if (!Number.isFinite(days) || days < 0 || days > 30) {
      setFilterError('Chọn khoảng ngày hợp lệ, tối đa 31 ngày.')
      return
    }
    setFilterError('')
    setFilters({ ...draft })
  }

  return (
    <div className="blink-page">
      <PageHeading title="Cảnh báo cảm biến ảo" />
      <p>Đèn nháy khi giá trị cảm biến lớn hơn 50% của y. Một lượt được tính khi bắt đầu một đợt cảnh báo.</p>
      {error && <p className="feedback feedback-error" role="alert">Không thể cập nhật trạng thái: {error}</p>}
      {loading && <p role="status">Đang tải trạng thái…</p>}
      <div className="blink-cards">
        {leds.map((led, index) => {
          const stale = led.hasData && (!led.receivedAt || now - Date.parse(led.receivedAt) >= 15000)
          const active = led.hasData && !stale && led.alertActive
          const status = !led.hasData ? 'Chưa có dữ liệu' : stale ? 'Mất cập nhật' : active ? 'Đang cảnh báo' : 'Tắt'
          return (
            <section className="panel blink-card" key={led.sensorId}>
              <div className="blink-card-heading">
                <div><h2>LED {index + 1}</h2><p>{led.name} · GPIO{led.pin}</p></div>
                <span className={`virtual-led${active ? ' is-alert' : ''}`} aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7M8 16h8M9 20h6M10 23h4" />
                  </svg>
                </span>
              </div>
              <strong className={`blink-status${active ? ' is-alert' : ''}`}>{status}</strong>
              <div className="blink-reading"><strong>{led.sensorValue ?? '—'}</strong><span>/ {led.y}</span></div>
              <p>Ngưỡng cảnh báo: &gt; {led.threshold}</p>
              {led.hasData && !stale && !led.timeSynced && <p className="blink-note">ESP32 chưa đồng bộ ngày, chưa ghi thống kê mới.</p>}
            </section>
          )
        })}
      </div>
      <h2>Số lượt cảnh báo theo ngày</h2>
      <form className="panel blink-filters" onSubmit={search}>
        <label>Từ ngày<input className="input" type="date" required value={draft.from}
          onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))} /></label>
        <label>Đến ngày<input className="input" type="date" required value={draft.to}
          onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))} /></label>
        <button className="button button-primary" type="submit">Xem thống kê</button>
        <span className="muted">Theo giờ Việt Nam (GMT+7), tối đa 31 ngày.</span>
      </form>
      {filterError && <p className="feedback feedback-error" role="alert">{filterError}</p>}
      {dailyError && <p className="feedback feedback-error" role="alert">Không thể tải thống kê: {dailyError}. Dữ liệu đang hiển thị có thể đã cũ.</p>}
      <div className="panel blink-table-wrap">
        <table className="data-table" aria-label="Số lượt cảnh báo theo ngày">
          <thead><tr><th>Ngày</th><th>LED 1</th><th>LED 2</th><th>LED 3</th><th>Tổng lượt</th></tr></thead>
          <tbody>
            {daily.map((row) => <tr key={row.date}>
              <td>{dateLabel(row.date)}</td>
              {['sensor1', 'sensor2', 'sensor3', 'total'].map((key) => <td key={key}>
                {row[key] === null ? '—' : Number(row[key]).toLocaleString('vi-VN')}
              </td>)}
            </tr>)}
            {!daily.length && <tr><td colSpan={5}>{dailyLoading ? 'Đang tải thống kê…' : 'Chưa có dữ liệu.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
