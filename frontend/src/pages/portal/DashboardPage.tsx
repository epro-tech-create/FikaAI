import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { PageHeading, StatePanel, StatCard } from '../../components/PortalUI'
import { useCampusClock } from '../../hooks/useCampusClock'
import { campusGreeting } from '../../lib/campusTime'
import type { Role } from '../../lib/auth'

export type TimelinePoint = { time: string; arrivals: number; departures: number }
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

export function chartCoords(points: TimelinePoint[], key: 'arrivals' | 'departures', maximum: number) {
  const span = chartBottom - chartTop
  return points.map((point, index) => {
    const x = chartLeft + (index / Math.max(1, points.length - 1)) * (chartRight - chartLeft)
    const y = clampChartY(chartBottom - (Math.max(0, point[key]) / Math.max(1, maximum)) * span)
    return { x, y }
  })
}

export function chartPolyline(points: TimelinePoint[], key: 'arrivals' | 'departures', maximum: number) {
  return chartCoords(points, key, maximum).map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

export function chartPath(points: TimelinePoint[], key: 'arrivals' | 'departures', maximum: number) {
  return chartCoords(points, key, maximum).map(({ x, y }, index) => (
    `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
  )).join(' ')
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

  const timeline = Array.isArray(data.timeline) && data.timeline.length ? data.timeline : emptyTimeline()
  const maximum = Math.max(1, ...timeline.flatMap(point => [point.arrivals, point.departures]))
  const arrivalPath = chartPath(timeline, 'arrivals', maximum)
  const departurePoints = chartPolyline(timeline, 'departures', maximum)
  const arrivalPoints = chartPolyline(timeline, 'arrivals', maximum)
  const fillPath = arrivalPath ? `${arrivalPath} L ${chartRight} ${chartBottom} L ${chartLeft} ${chartBottom} Z` : ''
  const yTicks = [maximum, Math.round(maximum / 2), 0]

  return <main className="portal-content"><PageHeading eyebrow="LIVE ATTENDANCE" title={`${campusGreeting(clock)}, ${(localStorage.getItem('fikaai.name') || role).split(' ')[0]}`} description="Today’s attendance at DIT RAFIC Building. The graph refreshes automatically every 10 seconds."/>
    {loading ? <StatePanel kind="loading"/> : error ? <StatePanel kind="error">{error}</StatePanel> : <>
      {role === 'admin' && <section className="stat-grid" aria-label="Daily student summary">
        <StatCard label="Registered students" value={data.students} note="All student accounts"/>
        <StatCard label="Checked in today" value={data.arrivalsToday} note="Verified arrivals today" tone="accent"/>
        <StatCard label="Face enrolled" value={data.activeFaceEnrollments} note="Active Face ID profiles"/>
        <StatCard label="Checked out today" value={data.departuresToday} note="Recorded departures today"/>
      </section>}
      {role === 'instructor' && <section className="stat-grid" aria-label="Daily student summary">
        <StatCard label="Checked in today" value={data.arrivalsToday} note="Verified arrivals today" tone="accent"/>
        <StatCard label="Checked out today" value={data.departuresToday} note="Recorded departures today"/>
        <StatCard label="Attendance records" value={data.attendanceRecords} note="All verified records"/>
      </section>}
      <section className="content-card attendance-chart-card">
      <div className="attendance-chart-head"><div><p>DAILY ATTENDANCE</p><h2>{String(data.date || 'Today')}</h2></div><div className="chart-totals"><span><i className="arrivals"/>Check-in <b>{String(data.arrivalsToday ?? 0)}</b></span><span><i className="departures"/>Check-out <b>{String(data.departuresToday ?? 0)}</b></span><small>Live</small></div></div>
      <div className="attendance-chart-wrap"><svg className="attendance-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Student check-in and check-out today">
        <defs>
          <linearGradient id="attendanceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b9cff" stopOpacity=".34"/><stop offset="1" stopColor="#3b9cff" stopOpacity=".02"/></linearGradient>
          <clipPath id="attendancePlot"><rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop}/></clipPath>
        </defs>
        {yTicks.map((tick, index) => { const y = chartTop + index * ((chartBottom - chartTop) / 2); return <g key={`${tick}-${index}`}><line className="chart-grid-line" x1={chartLeft} x2={chartRight} y1={y} y2={y}/><text className="chart-y-label" x={chartLeft - 13} y={y + 4}>{tick}</text></g> })}
        <g clipPath="url(#attendancePlot)">
          {fillPath && <path className="chart-area" d={fillPath}/>}
          <polyline className="chart-line arrivals" points={arrivalPoints}/>
          <polyline className="chart-line departures" points={departurePoints}/>
        </g>
        {timeline.map((point, index) => {
          const x = chartLeft + (index / Math.max(1, timeline.length - 1)) * (chartRight - chartLeft)
          return index % 2 === 0 ? <text key={point.time} className="chart-x-label" x={x} y={chartBottom + 28}>{point.time}</text> : null
        })}
      </svg></div>
      </section>
    </>}
  </main>
}
