import { useEffect, useRef, useState } from 'react'
import { formatMockTime } from '../data/mockData'

export default function LineChart({ title, unit, ticks, precision, samples, hours, className, sensorKey }) {
  const svgRef = useRef(null)
  const [size, setSize] = useState({ width: 600, height: 120 })
  const [hover, setHover] = useState(null)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    observer.observe(svgRef.current)
    return () => observer.disconnect()
  }, [])

  const values = samples.map((sample) => sample[sensorKey])
  const min = ticks.at(-1)
  const max = ticks[0]
  const left = unit === 'lux' ? 40 : 28
  const right = size.width - 20
  const top = 9
  const bottom = size.height - 23
  const points = values.map((value, index) => ({
    x: left + index * (right - left) / (values.length - 1),
    y: bottom - (value - min) / (max - min) * (bottom - top),
  }))
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const active = hover === null ? null : Math.min(hover, points.length - 1)
  const labelCount = size.width < 380 ? 3 : 5
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const formatValue = (value) => `${value.toFixed(precision)} ${unit}`

  function inspect(event) {
    const bounds = svgRef.current.getBoundingClientRect()
    const x = (event.clientX - bounds.left) * size.width / bounds.width
    setHover(Math.max(0, Math.min(points.length - 1, Math.round((x - left) / (right - left) * (points.length - 1)))))
  }

  return (
    <section className={`panel chart-panel ${className}`}>
      <div className="chart-heading"><h2>{title}</h2><span>{hours} giờ · {unit}</span></div>
      <div className="chart-plot">
        <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} role="img" tabIndex={0}
          aria-label={`${title}, ${formatMockTime(samples[0].timestamp)} đến ${formatMockTime(samples.at(-1).timestamp)}, từ ${formatValue(Math.min(...values))} đến ${formatValue(Math.max(...values))}. Dùng phím trái, phải để xem từng mốc.`}
          onPointerMove={inspect} onPointerLeave={() => setHover(null)} onPointerDown={inspect}
          onFocus={() => setHover(points.length - 1)} onBlur={() => setHover(null)}
          onKeyDown={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              setHover((current) => event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 :
                Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))))
            }
          }}>
          {ticks.map((tick) => {
            const y = bottom - (tick - min) / (max - min) * (bottom - top)
            return <g key={tick}><line x1={left} y1={y} x2={right} y2={y} stroke="#e5e5e5" /><text x={left - 7} y={y + 3} textAnchor="end" fill="#707070" fontSize="10">{tick}</text></g>
          })}
          <path d={line} fill="none" stroke="#111" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={points.at(-1).x} cy={points.at(-1).y} r="2.5" fill="#111" />
          {Array.from({ length: labelCount }, (_, index) => {
            const pointIndex = Math.round(index * (points.length - 1) / (labelCount - 1))
            return <text key={index} x={points[pointIndex].x} y={size.height - 5} textAnchor={index === 0 ? 'start' : index === labelCount - 1 ? 'end' : 'middle'} fill="#707070" fontSize="10">{formatMockTime(samples[pointIndex].timestamp)}</text>
          })}
          {active !== null && <g><line x1={points[active].x} y1={top} x2={points[active].x} y2={bottom} stroke="#999" strokeDasharray="3 3" /><circle cx={points[active].x} cy={points[active].y} r="3" fill="#111" stroke="white" strokeWidth="1" /></g>}
        </svg>
        {active !== null && <output className="chart-tooltip" style={{ left: `${Math.max(20, Math.min(80, points[active].x / size.width * 100))}%` }}>{formatMockTime(samples[active].timestamp)} · <strong>{formatValue(values[active])}</strong></output>}
      </div>
      <div className="chart-summary"><span>Thấp nhất <b>{formatValue(Math.min(...values))}</b></span><span>Trung bình <b>{formatValue(average)}</b></span><span>Cao nhất <b>{formatValue(Math.max(...values))}</b></span></div>
    </section>
  )
}
