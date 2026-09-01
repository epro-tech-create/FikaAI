import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { PageHeading, StatePanel, StatCard } from '../../components/PortalUI'
import { useCampusClock } from '../../hooks/useCampusClock'
import { campusGreeting, formatCampusDate } from '../../lib/campusTime'
import type { Role } from '../../lib/auth'

export type TimelinePoint = { time: string; arrivals: number; departures: number }
type PlotPoint = { x: number; y: number }
type DashboardData = {
  date?: string
  students?: number
  arrivalsToday?: number
  activeFaceEnrollments?: number
  departuresToday?: number
  attendanceRecords?: number
  timeline?: TimelinePoint[]
}

export const chartWidth = 900
export const chartHeight = 300
export const chartLeft = 48
export const chartRight = 872
export const chartTop = 30
export const chartBottom = 244

export function emptyTimeline(): TimelinePoint[] {
  const points: TimelinePoint[] = []
  for (let minute = 8 * 60; minute <= 16 * 60; minute += 30) {
    const hour = String(Math.floor(minute / 60)).padStart(2, '0')
    const mins = String(minute % 60).padStart(2, '0')
    points.push({ time: `${hour}:${mins}`, arrivals: 0, departures: 0 })
  }
  return points
}

export function clampChartY(y: number): number {
  return Math.min(chartBottom, Math.max(chartTop, y))
}

export function chartPoints(series: TimelinePoint[], key: 'arrivals' | 'departures', maximum: number): PlotPoint[] {
  const points = series.length ? series : emptyTimeline()
  const span = chartBottom - chartTop
  return points.map((point, index) => ({
    x: chartLeft + (index / Math.max(1, points.length - 1)) * (chartRight - chartLeft),
    y: clampChartY(chartBottom - (Math.max(0, point[key]) / Math.max(1, maximum)) * span),
  }))
}

/** Catmull-Rom spline converted to cubic Bézier commands, clamped to the plot. */
export function splinePath(points: PlotPoint[], tension = 0.35): string {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${clampChartY(points[0].y).toFixed(1)}`
  const parts = [`M ${points[0].x.toFixed(1)} ${clampChartY(points[0].y).toFixed(1)}`]
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index === 0 ? 0 : index - 1]
    const current = points[index]
    const next = points[index + 1]
    const after = points[index + 2] ?? next
    const control1x = current.x + (next.x - previous.x) * tension
    const control1y = clampChartY(current.y + (next.y - previous.y) * tension)
    const control2x = next.x - (after.x - current.x) * tension
    const control2y = clampChartY(next.y - (after.y - current.y) * tension)
    parts.push(`C ${control1x.toFixed(1)} ${control1y.toFixed(1)} ${control2x.toFixed(1)} ${control2y.toFixed(1)} ${next.x.toFixed(1)} ${clampChartY(next.y).toFixed(1)}`)
  }
  return parts.join(' ')
}

export function areaPath(line: string): string {
  if (!line) return ''
  return `${line} L ${chartRight.toFixed(1)} ${chartBottom.toFixed(1)} L ${chartLeft.toFixed(1)} ${chartBottom.toFixed(1)} Z`
}

export default function DashboardPage({ role }: { role: Extract<Role, 'admin' | 'instructor'> }) {
  const clock = useCampusClock()
  const [data, setData] = useState<DashboardData>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const response = await api.get(`/${role}/dashboard`)
        if (active) { setData(response.data || {}); setError('') }
      } catch (requestError) {
        if (active) setError(message(requestError))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(load, 10_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [role])

  const points = Array.isArray(data.timeline) && data.timeline.length ? data.timeline : emptyTimeline()
  const maximum = Math.max(1, ...points.map(point => Math.max(point.arrivals, point.departures)))
  const arrivalLine = splinePath(chartPoints(points, 'arrivals', maximum))
  const departureLine = splinePath(chartPoints(points, 'departures', maximum))
  const fillPath = areaPath(arrivalLine)
  const yTicks = [maximum, Math.round(maximum / 2), 0]
  const lastPoint = points[points.length - 1]
  const arrivals = data.arrivalsToday ?? lastPoint?.arrivals ?? 0
  const departures = data.departuresToday ?? lastPoint?.departures ?? 0

  return <main className="portal-content"><PageHeading eyebrow="LIVE ATTENDANCE" title={`${campusGreeting(clock)}, ${(localStorage.getItem('fikaai.name') || role).split(' ')[0]}`} description="Student attendance today at DIT RAFIC. Check-in and check-out update every 10 seconds."/>
    {loading ? <StatePanel kind="loading"/> : error ? <StatePanel kind="error">{error}</StatePanel> : <>
      {role === 'admin' && <section className="stat-grid" aria-label="Daily student summary">
        <StatCard label="Registered students" value={data.students} note="All student accounts"/>
        <StatCard label="Checked in today" value={arrivals} note="Verified arrivals today" tone="accent"/>
        <StatCard label="Face enrolled" value={data.activeFaceEnrollments} note="Active Face ID profiles"/>
        <StatCard label="Checked out today" value={departures} note="Recorded departures today"/>
      </section>}
      {role === 'instructor' && <section className="stat-grid" aria-label="Daily student summary">
        <StatCard label="Checked in today" value={arrivals} note="Verified arrivals today" tone="accent"/>
        <StatCard label="Checked out today" value={departures} note="Recorded departures today"/>
        <StatCard label="Attendance records" value={data.attendanceRecords} note="All verified records"/>
      </section>}
      <section className="content-card attendance-chart-card">
      <div className="attendance-chart-head"><div><p>DAILY ATTENDANCE</p><h2>{formatCampusDate(clock)}</h2></div><div className="chart-totals"><span><i className="arrivals"/>Check-in <b>{String(arrivals)}</b></span><span><i className="departures"/>Check-out <b>{String(departures)}</b></span><small>Live</small></div></div>
      <div className="attendance-chart-wrap"><svg className="attendance-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Student check-in and check-out today">
        <defs>
          <linearGradient id="attendanceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b9cff" stopOpacity=".42"/><stop offset="1" stopColor="#3b9cff" stopOpacity="0"/></linearGradient>
          <clipPath id="attendancePlot"><rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop}/></clipPath>
        </defs>
        {yTicks.map((tick, index) => { const y = chartTop + index * ((chartBottom - chartTop) / 2); return <g key={`${tick}-${index}`}><line className="chart-grid-line" x1={chartLeft} x2={chartRight} y1={y} y2={y}/><text className="chart-y-label" x={chartLeft - 13} y={y + 4}>{tick}</text></g> })}
        <g clipPath="url(#attendancePlot)">
          {fillPath && <path className="chart-area" d={fillPath}/>}
          <path className="chart-line arrivals" d={arrivalLine}/>
          <path className="chart-line departures" d={departureLine}/>
        </g>
        {points.map((point, index) => {
          if (!point.time.endsWith(':00')) return null
          const x = chartLeft + (index / Math.max(1, points.length - 1)) * (chartRight - chartLeft)
          return <text key={`${point.time}-${index}`} className="chart-x-label" x={x} y={chartBottom + 28}>{point.time}</text>
        })}
      </svg></div>
      </section>
    </>}
  </main>
}
