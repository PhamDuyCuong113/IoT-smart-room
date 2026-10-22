import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import LineChart from '../../components/LineChart'
import { getDashboard, getSocketOrigin, setDeviceStatus } from '../../api/client'
import './Dashboard.css'

const sensorPresentation = {
  'DHT11 - Nhiệt độ': { label: 'NHIỆT ĐỘ', title: 'Biến động nhiệt độ', short: 'Nhiệt độ', precision: 1 },
  'DHT11 - Độ ẩm': { label: 'ĐỘ ẨM', title: 'Biến động độ ẩm', short: 'Độ ẩm', precision: 0 },
  'Cảm biến ánh sáng': { label: 'ÁNH SÁNG', title: 'Biến động ánh sáng', short: 'Ánh sáng', precision: 0 },
}

function presentationFor(name) {
  return sensorPresentation[name] || {
    label: name.toLocaleUpperCase('vi'),
    title: `Biến động ${name.toLocaleLowerCase('vi')}`,
    short: name,
    precision: 1,
  }
}

function mergeSensorReading(current, reading) {
  if (!current) return current
  const name = reading.sensor || reading.name
  if (!name) return current
  const sensors = [...(current.sensors || [])]
  const index = sensors.findIndex((sensor) => sensor.name === name)
  const value = {
    ...(index >= 0 ? sensors[index] : {}),
    name,
    unit: reading.unit || (index >= 0 ? sensors[index].unit : ''),
    value: Number(reading.value),
    recorded_at: reading.recorded_at,
  }
  if (index >= 0) sensors[index] = value
  else sensors.push(value)

  const point = { ...reading, name, sensor: name }
  const series = [...(current.series || [])]
  if (!series.some((item) => item.id != null && item.id === point.id)) series.push(point)
  return { ...current, sensors, series: series.slice(-1500) }
}

export default function Dashboard({ canControlDevices: canControl = false }) {
  const [dashboard, setDashboard] = useState(null)
  const [activeChart, setActiveChart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadingDevices, setLoadingDevices] = useState({})
  const [deviceErrors, setDeviceErrors] = useState({})
  const toggleLocks = useRef(new Set())

  useEffect(() => {
    const controller = new AbortController()
    getDashboard({ signal: controller.signal })
      .then((data) => {
        setDashboard({
          sensors: Array.isArray(data.sensors) ? data.sensors : [],
          series: Array.isArray(data.series) ? data.series : [],
          devices: Array.isArray(data.devices) ? data.devices : [],
        })
        setError('')
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') setError(requestError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const socket = io(getSocketOrigin())
    let connectedOnce = false
    socket.on('connect', () => {
      if (!connectedOnce) {
        connectedOnce = true
        return
      }
      getDashboard().then((data) => setDashboard({
        sensors: Array.isArray(data.sensors) ? data.sensors : [],
        series: Array.isArray(data.series) ? data.series : [],
        devices: Array.isArray(data.devices) ? data.devices : [],
      })).then(() => setError('')).catch((requestError) => setError(requestError.message))
    })
    socket.on('sensor:new', (reading) => {
      setDashboard((current) => mergeSensorReading(current, reading))
    })
    socket.on('device:updated', (updated) => {
      setDashboard((current) => current ? {
        ...current,
        devices: current.devices.map((device) => Number(device.id) === Number(updated.id)
          ? { ...device, ...updated }
          : device),
      } : current)
    })
    return () => socket.disconnect()
  }, [])

  const sensors = dashboard?.sensors || []
  const devices = dashboard?.devices || []
  const series = dashboard?.series || []
  const chartSensor = sensors.find((sensor) => String(sensor.id) === String(activeChart)) || sensors[0]

  async function handleDeviceToggle(device) {
    if (toggleLocks.current.has(device.id)) return
    toggleLocks.current.add(device.id)
    setLoadingDevices((current) => ({ ...current, [device.id]: true }))
    setDeviceErrors((current) => ({ ...current, [device.id]: '' }))
    const targetStatus = device.status === 'ON' ? 'OFF' : 'ON'
    try {
      const updated = await setDeviceStatus(device.id, targetStatus)
      setDashboard((current) => current ? {
        ...current,
        devices: current.devices.map((item) => Number(item.id) === Number(updated.id)
          ? { ...item, ...updated }
          : item),
      } : current)
    } catch (requestError) {
      setDeviceErrors((current) => ({ ...current, [device.id]: requestError.message }))
    } finally {
      toggleLocks.current.delete(device.id)
      setLoadingDevices((current) => ({ ...current, [device.id]: false }))
    }
  }

  function sensorSeries(sensor) {
    return series
      .filter((reading) => Number(reading.sensor_id) === Number(sensor.id) ||
        (reading.name || reading.sensor) === sensor.name)
      .map((reading) => ({ timestamp: reading.recorded_at, value: Number(reading.value) }))
      .filter((reading) => Number.isFinite(reading.value) && reading.timestamp)
  }

  return (
    <div className="dashboard-page" aria-busy={loading}>
      <div className="dashboard-heading">
        <h1>Tổng quan phòng</h1>
        {error && <p className="feedback feedback-error" role="alert">Không thể tải Dashboard: {error}</p>}
      </div>
      <div className="metric-grid">
        {sensors.map((sensor) => {
          const presentation = presentationFor(sensor.name)
          const value = sensor.value == null ? null : Number(sensor.value)
          return (
            <section key={sensor.id ?? sensor.name} className="panel metric-card">
              <h2>{presentation.label}</h2>
              <strong>
                {value == null || !Number.isFinite(value)
                  ? <small>{loading ? 'Đang tải…' : 'Chưa có dữ liệu'}</small>
                  : <>{value.toFixed(presentation.precision)} <small>{sensor.unit}</small></>}
              </strong>
            </section>
          )
        })}
      </div>
      <div className="dashboard-grid">
        <div className="chart-stack">
          {sensors.length > 0 && (
            <div className="chart-tabs" role="group" aria-label="Chọn biểu đồ">
              {sensors.map((sensor) => (
                <button key={sensor.id ?? sensor.name} type="button"
                  aria-pressed={String(chartSensor?.id) === String(sensor.id)}
                  onClick={() => setActiveChart(sensor.id)}>
                  {presentationFor(sensor.name).short}
                </button>
              ))}
            </div>
          )}
          {sensors.map((sensor) => {
            const presentation = presentationFor(sensor.name)
            return (
              <LineChart key={sensor.id ?? sensor.name}
                title={presentation.title}
                unit={sensor.unit}
                precision={presentation.precision}
                samples={sensorSeries(sensor)}
                hours={6}
                sensorKey={String(sensor.id ?? sensor.name)}
                className={String(chartSensor?.id ?? chartSensor?.name) === String(sensor.id ?? sensor.name) ? 'is-active' : ''}
              />
            )
          })}
          {!loading && !error && sensors.length === 0 && (
            <p className="feedback">Backend chưa có cấu hình cảm biến.</p>
          )}
        </div>
        <aside className="dashboard-sidebar">
          <section className="panel devices-panel">
            <div className="devices-heading"><h2>Thiết bị</h2></div>
            <p>{canControl ? 'Điều khiển thủ công' : 'Chế độ chỉ xem'}</p>
            {!canControl && (
              <p className="device-permission-note">Vai trò hiện tại chưa có quyền bật hoặc tắt thiết bị. Hãy liên hệ quản trị viên để được cấp quyền điều khiển.</p>
            )}
            {loading && <p>Đang tải trạng thái thiết bị…</p>}
            {!loading && !error && devices.length === 0 && <p>Chưa có thiết bị trong hệ thống.</p>}
            <div className="device-list">
              {devices.map((device) => {
                const isOn = device.status === 'ON'
                const isLoading = Boolean(loadingDevices[device.id])
                return (
                  <div className="device-row" key={device.id}>
                    <div>
                      <h3>{device.name}</h3>
                      <span aria-live="polite">
                        {isLoading ? 'Đang xử lý…' : `Đang ${isOn ? 'bật' : 'tắt'}`}
                      </span>
                      {deviceErrors[device.id] && (
                        <span className="device-error" role="alert">{deviceErrors[device.id]}</span>
                      )}
                    </div>
                    <button className={`device-switch ${isOn ? 'is-on' : ''} ${isLoading ? 'is-loading' : ''}`}
                      type="button" role="switch" aria-checked={isOn} aria-busy={isLoading}
                      aria-label={device.name} title={!canControl ? 'Tài khoản chưa có quyền điều khiển' : undefined}
                      disabled={!canControl || isLoading || loading || Boolean(error)}
                      onClick={() => handleDeviceToggle(device)}><span /></button>
                  </div>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
