import { useEffect, useRef, useState } from 'react'

function displayTimestamp(value) {
  const text = String(value || '')
  const sqlDate = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/)
  if (sqlDate) return `${sqlDate[3]}/${sqlDate[2]} ${sqlDate[4]}`
  return text
}

export default function LineChart({ title, unit, precision = 1, samples = [], hours, className }) {
  const svgRef = useRef(null)
  const [size, setSize] = useState({ width: 600, height: 120 })
  const [hover, setHover] = useState(null)
  const pointsData = samples.filter((sample) => Number.isFinite(Number(sample.value)) && sample.timestamp)
  const hasSamples = pointsData.length > 0

  useEffect(() => {
    const element = svgRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasSamples])

  if (pointsData.length === 0) {
    return (
      <section className={`panel chart-panel ${className || ''}`}>
        <div className="chart-heading"><h2>{title}</h2><span>{hours} giờ · {unit}</span></div>
        <p className="empty-state chart-empty">Chưa có dữ liệu trong khoảng thời gian này.</p>
        <div className="chart-summary" />
      </section>
    )
  }

  const values = pointsData.map((sample) => Number(sample.value))
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const dataRange = dataMax - dataMin
  const padding = dataRange === 0 ? Math.max(Math.abs(dataMax) * 0.08, 1) : dataRange * 0.08
  const min = dataMin - padding
  const max = dataMax + padding
  const ticks = Array.from({ length: 4 }, (_, index) => max - (max - min) * index / 3)
  const left = unit === 'ADC' ? 46 : 38
  const right = size.width - 20
  const top = 9
  const bottom = size.height - 23
  const points = values.map((value, index) => ({
    x: pointsData.length === 1 ? (left + right) / 2 : left + index * (right - left) / (pointsData.length - 1),
    y: bottom - (value - min) / (max - min) * (bottom - top),
  }))
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const active = hover === null ? null : Math.min(hover, points.length - 1)
  const labelCount = Math.min(points.length, size.width < 380 ? 3 : 5)
  const labelIndices = Array.from({ length: labelCount }, (_, index) =>
    labelCount === 1 ? points.length - 1 : Math.round(index * (points.length - 1) / (labelCount - 1)),
  )
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const formatValue = (value) => `${Number(value).toFixed(precision)} ${unit}`

  function inspect(event) {
    const bounds = svgRef.current.getBoundingClientRect()
    const x = (event.clientX - bounds.left) * size.width / bounds.width
    const index = points.length === 1 ? 0 : Math.round((x - left) / (right - left) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, index)))
  }

  return (
    <section className={`panel chart-panel ${className || ''}`}>
      <div className="chart-heading"><h2>{title}</h2><span>{hours} giờ · {unit}</span></div>
      <div className="chart-plot">
        <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} role="img" tabIndex={0}
          aria-label={`${title}, ${displayTimestamp(pointsData[0].timestamp)} đến ${displayTimestamp(pointsData.at(-1).timestamp)}, từ ${formatValue(dataMin)} đến ${formatValue(dataMax)}. Dùng phím trái, phải để xem từng mốc.`}
          onPointerMove={inspect} onPointerLeave={() => setHover(null)} onPointerDown={inspect}
          onFocus={() => setHover(points.length - 1)} onBlur={() => setHover(null)}
          onKeyDown={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              setHover((current) => event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 :
                Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))))
            }
          }}>
          {ticks.map((tick, index) => {
            const y = bottom - (tick - min) / (max - min) * (bottom - top)
            return <g key={index}>
              <line x1={left} y1={y} x2={right} y2={y} stroke="#e5e5e5" />
              <text x={left - 7} y={y + 3} textAnchor="end" fill="#707070" fontSize="10">
                {tick.toFixed(precision)}
              </text>
            </g>
          })}
          <path d={line} fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={points.at(-1).x} cy={points.at(-1).y} r="2.5" fill="#111" />
          {labelIndices.map((pointIndex, index) => (
            <text key={pointIndex} x={points[pointIndex].x} y={size.height - 5}
              textAnchor={labelIndices.length === 1 || index === 0 ? 'start' : index === labelIndices.length - 1 ? 'end' : 'middle'}
              fill="#707070" fontSize="10">
              {displayTimestamp(pointsData[pointIndex].timestamp)}
            </text>
          ))}
          {active !== null && <g>
            <line x1={points[active].x} y1={top} x2={points[active].x} y2={bottom} stroke="#999" strokeDasharray="3 3" />
            <circle cx={points[active].x} cy={points[active].y} r="3" fill="#111" stroke="white" strokeWidth="1" />
          </g>}
        </svg>
        {active !== null && <output className="chart-tooltip"
          style={{ left: `${Math.max(20, Math.min(80, points[active].x / size.width * 100))}%` }}>
          {displayTimestamp(pointsData[active].timestamp)} · <strong>{formatValue(values[active])}</strong>
        </output>}
      </div>
      <div className="chart-summary">
        <span>Thấp nhất <b>{formatValue(dataMin)}</b></span>
        <span>Trung bình <b>{formatValue(average)}</b></span>
        <span>Cao nhất <b>{formatValue(dataMax)}</b></span>
      </div>
    </section>
  )
}
