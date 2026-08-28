import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { PageHeading, StatePanel, StatCard } from '../../components/PortalUI'
import type { Role } from '../../lib/auth'

type TimelinePoint = { time: string; arrivals: number; departures: number }
type DashboardData = {
  date?: string
  students?: number
  arrivalsToday?: number
  activeFaceEnrollments?: number
  departuresToday?: number
  timeline?: TimelinePoint[]
}

const chartWidth = 900
const chartHeight = 300
const chartLeft = 48
const chartRight = 872
const chartTop = 30
const chartBottom = 244

export function chartPath(points: TimelinePoint[], key: 'arrivals' | 'departures', maximum: number) {
  if (!points.length) return ''
  return points.map((point, index) => {
    const x = chartLeft + (index / Math.max(1, points.length - 1)) * (chartRight - chartLeft)
    const y = chartBottom - (point[key] / Math.max(1, maximum)) * (chartBottom - chartTop)
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

export default function DashboardPage({ role }: { role: Extract<Role, 'admin' | 'instructor'> }) {
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

  const timeline = Array.isArray(data.timeline) ? data.timeline : []
  const maximum = Math.max(1, ...timeline.flatMap(point => [point.arrivals, point.departures]))
  const arrivalPath = chartPath(timeline, 'arrivals', maximum)
  const departurePath = chartPath(timeline, 'departures', maximum)
  const areaPath = arrivalPath ? `${arrivalPath} L ${chartRight} ${chartBottom} L ${chartLeft} ${chartBottom} Z` : ''
  const yTicks = [maximum, Math.round(maximum / 2), 0]

  return <main className="portal-content"><PageHeading eyebrow="LIVE ATTENDANCE" title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${(localStorage.getItem('fikaai.name') || role).split(' ')[0]}`} description="Today’s attendance at DIT RAFIC Building. The graph refreshes automatically every 10 seconds."/>
    {loading ? <StatePanel kind="loading"/> : error ? <StatePanel kind="error">{error}</StatePanel> : <>
      {role === 'admin' && <section className="stat-grid" aria-label="Daily student summary">
        <StatCard label="Registered students" value={data.students} note="All student accounts"/>
        <StatCard label="Checked in today" value={data.arrivalsToday} note="Verified arrivals today" tone="accent"/>
        <StatCard label="Face enrolled" value={data.activeFaceEnrollments} note="Active Face ID profiles"/>
        <StatCard label="Checked out today" value={data.departuresToday} note="Recorded departures today"/>
      </section>}
      <section className="content-card attendance-chart-card">
      <div className="attendance-chart-head"><div><p>DAILY ATTENDANCE</p><h2>{String(data.date || 'Today')}</h2></div><div className="chart-totals"><span><i className="arrivals"/>Arrived <b>{String(data.arrivalsToday ?? 0)}</b></span><span><i className="departures"/>Checked out <b>{String(data.departuresToday ?? 0)}</b></span><small>Live</small></div></div>
      <div className="attendance-chart-wrap"><svg className="attendance-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Cumulative arrivals and checkouts today">
        <defs><linearGradient id="attendanceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b9cff" stopOpacity=".34"/><stop offset="1" stopColor="#3b9cff" stopOpacity=".02"/></linearGradient></defs>
        {yTicks.map((tick, index) => { const y = chartTop + index * ((chartBottom - chartTop) / 2); return <g key={`${tick}-${index}`}><line className="chart-grid-line" x1={chartLeft} x2={chartRight} y1={y} y2={y}/><text className="chart-y-label" x={chartLeft - 13} y={y + 4}>{tick}</text></g> })}
        {areaPath && <path className="chart-area" d={areaPath}/>}<path className="chart-line arrivals" d={arrivalPath}/><path className="chart-line departures" d={departurePath}/>
        {timeline.map((point, index) => { const x = chartLeft + (index / Math.max(1, timeline.length - 1)) * (chartRight - chartLeft); return index % 2 === 0 ? <text key={point.time} className="chart-x-label" x={x} y={chartBottom + 28}>{point.time}</text> : null })}
      </svg></div>
      </section>
    </>}
  </main>
}
