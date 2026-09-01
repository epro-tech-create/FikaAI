import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { PageHeading, StatePanel, StatCard } from '../../components/PortalUI'
import { useCampusClock } from '../../hooks/useCampusClock'
import { campusGreeting } from '../../lib/campusTime'
import type { Role } from '../../lib/auth'

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

export type WeekPoint = { day: string; date: string; arrivals: number; departures: number }
type PlotPoint = { x: number; y: number }
type DashboardData = {
  date?: string
  students?: number
  arrivalsToday?: number
  activeFaceEnrollments?: number
  departuresToday?: number
  assignedCourses?: number
  weeklySeries?: {
    startDate?: string
    endDate?: string
    label?: string
    arrivals?: number
    departures?: number
    days?: WeekPoint[]
  }
}

export const chartWidth = 900
export const chartHeight = 300
export const chartLeft = 48
export const chartRight = 872
export const chartTop = 30
export const chartBottom = 244

export function emptyWeek(): WeekPoint[] {
  return WEEKDAYS.map(day => ({ day, date: '', arrivals: 0, departures: 0 }))
}

export function clampChartY(y: number): number {
  return Math.min(chartBottom, Math.max(chartTop, y))
}

export function chartPoints(series: WeekPoint[], key: 'arrivals' | 'departures', maximum: number): PlotPoint[] {
  const points = series.length ? series : emptyWeek()
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

  const week = data.weeklySeries
  const days = Array.isArray(week?.days) && week.days.length ? week.days : emptyWeek()
  const maximum = Math.max(1, ...days.map(point => point.arrivals))
  const arrivalLine = splinePath(chartPoints(days, 'arrivals', maximum))
  const fillPath = areaPath(arrivalLine)
  const yTicks = [maximum, Math.round(maximum / 2), 0]
  const weekLabel = week?.label || 'Monday – Friday'
  const weekArrivals = week?.arrivals ?? days.reduce((total, point) => total + point.arrivals, 0)
  const weekDepartures = week?.departures ?? days.reduce((total, point) => total + point.departures, 0)

  return <main className="portal-content"><PageHeading eyebrow="LIVE ATTENDANCE" title={`${campusGreeting(clock)}, ${(localStorage.getItem('fikaai.name') || role).split(' ')[0]}`} description="Student attendance this week at DIT RAFIC, Monday to Friday. The graph updates every 10 seconds."/>
    {loading ? <StatePanel kind="loading"/> : error ? <StatePanel kind="error">{error}</StatePanel> : <>
      {role === 'admin' && <section className="stat-grid" aria-label="Daily student summary">
        <StatCard label="Registered students" value={data.students} note="All student accounts"/>
        <StatCard label="Checked in today" value={data.arrivalsToday} note="Verified arrivals today" tone="accent"/>
        <StatCard label="Face enrolled" value={data.activeFaceEnrollments} note="Active Face ID profiles"/>
        <StatCard label="Checked out today" value={data.departuresToday} note="Recorded departures today"/>
      </section>}
      {role === 'instructor' && <section className="stat-grid" aria-label="Weekly student summary">
        <StatCard label="Checked in this week" value={weekArrivals} note="Monday to Friday" tone="accent"/>
        <StatCard label="Checked out this week" value={weekDepartures} note="Recorded departures this week"/>
        <StatCard label="Checked in today" value={data.arrivalsToday} note="Verified arrivals today"/>
        <StatCard label="Assigned courses" value={data.assignedCourses} note="Your teaching load"/>
      </section>}
      <section className="content-card attendance-chart-card">
      <div className="attendance-chart-head"><div><p>WEEKLY ATTENDANCE</p><h2>{weekLabel}</h2></div><div className="chart-totals"><span><i className="arrivals"/>Arrived <b>{String(weekArrivals)}</b></span><span><i className="departures"/>Checked out <b>{String(weekDepartures)}</b></span><small>Live</small></div></div>
      <div className="attendance-chart-wrap"><svg className="attendance-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Student arrivals from Monday to Friday">
        <defs>
          <linearGradient id="attendanceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b9cff" stopOpacity=".42"/><stop offset="1" stopColor="#3b9cff" stopOpacity="0"/></linearGradient>
          <clipPath id="attendancePlot"><rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop}/></clipPath>
        </defs>
        {yTicks.map((tick, index) => { const y = chartTop + index * ((chartBottom - chartTop) / 2); return <g key={`${tick}-${index}`}><line className="chart-grid-line" x1={chartLeft} x2={chartRight} y1={y} y2={y}/><text className="chart-y-label" x={chartLeft - 13} y={y + 4}>{tick}</text></g> })}
        <g clipPath="url(#attendancePlot)">
          {fillPath && <path className="chart-area" d={fillPath}/>}
          <path className="chart-line arrivals" d={arrivalLine}/>
        </g>
        {days.map((point, index) => {
          const x = chartLeft + (index / Math.max(1, days.length - 1)) * (chartRight - chartLeft)
          return <text key={`${point.day}-${point.date || index}`} className="chart-x-label" x={x} y={chartBottom + 28}>{point.day}</text>
        })}
      </svg></div>
      </section>
    </>}
  </main>
}
