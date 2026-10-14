import { useEffect, useRef, useState } from 'react'
import LineChart from '../../components/LineChart'
import { sensorDefinitions, sensorSamples } from '../../data/mockData'
import { useMockRoom } from '../../data/useMockRoom'
import './Dashboard.css'

export default function Dashboard() {
  const { devices, toggleDevice } = useMockRoom()
  const [activeChart, setActiveChart] = useState('temperature')
  const [loadingDevices, setLoadingDevices] = useState({})
  const toggleTimers = useRef(new Map())
  const latest = sensorSamples.at(-1)

  useEffect(() => () => {
    toggleTimers.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  function handleDeviceToggle(name) {
    if (toggleTimers.current.has(name)) return
    setLoadingDevices((current) => ({ ...current, [name]: true }))
    const timer = window.setTimeout(() => {
      toggleDevice(name)
      toggleTimers.current.delete(name)
      setLoadingDevices((current) => ({ ...current, [name]: false }))
    }, 500)
    toggleTimers.current.set(name, timer)
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <h1>Tổng quan phòng</h1>
      </div>
      <div className="metric-grid">
        {sensorDefinitions.map((sensor) => (
          <section key={sensor.key} className="panel metric-card">
            <h2>{sensor.label}</h2>
            <strong>{latest[sensor.key].toFixed(sensor.precision)} <small>{sensor.unit}</small></strong>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="chart-stack">
          <div className="chart-tabs" role="group" aria-label="Chọn biểu đồ">
            {sensorDefinitions.map((sensor) => (
              <button key={sensor.key} type="button" aria-pressed={activeChart === sensor.key}
                onClick={() => setActiveChart(sensor.key)}>{sensor.shortLabel}</button>
            ))}
          </div>
          {sensorDefinitions.map(({ key, ...sensor }) => (
            <LineChart key={key} sensorKey={key} {...sensor} samples={sensorSamples} hours={6}
              className={activeChart === key ? 'is-active' : ''} />
          ))}
        </div>
        <aside className="dashboard-sidebar">
          <section className="panel devices-panel">
            <div className="devices-heading"><h2>Thiết bị ảo</h2></div>
            <p>Điều khiển thủ công</p>
            <div className="device-list">
              {devices.map((device) => (
                <div className="device-row" key={device.name}>
                  <div><h3>{device.name}</h3><span aria-live="polite">
                    {loadingDevices[device.name] ? 'Đang xử lý…' : `Đang ${device.on ? 'bật' : 'tắt'}`}
                  </span></div>
                  <button className={`device-switch ${device.on ? 'is-on' : ''} ${loadingDevices[device.name] ? 'is-loading' : ''}`}
                    type="button" role="switch" aria-checked={device.on} aria-busy={Boolean(loadingDevices[device.name])}
                    aria-label={device.name} disabled={Boolean(loadingDevices[device.name])}
                    onClick={() => handleDeviceToggle(device.name)}><span /></button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
