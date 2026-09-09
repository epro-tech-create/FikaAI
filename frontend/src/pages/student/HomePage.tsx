import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { useCampusClock } from '../../hooks/useCampusClock'
import { campusGreeting, formatCampusDate, formatCampusTime } from '../../lib/campusTime'
import { displayMembershipId, displayRegistration } from '../../lib/studentId'
type Msg = { id: string; title: string; body: string; time: string; unread?: boolean }

function minutesFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  // iso like "2026-09-09T08:23:00+03:00" or "2026-09-09T08:23:00.000Z"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // Use campus timezone hour/minute via converting to Africa/Dar prop
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? '0')
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  return hh * 60 + mm
}

function fmtMinutes(m: number | null): string {
  if (m == null) return '—'
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${mm} ${suffix}`
}

function shortMinutes(m: number | null): string {
  if (m == null) return '—'
  const h = Math.floor(m / 60) % 12 || 12
  const mm = String(m % 60).padStart(2, '0')
  return `${h}:${mm}`
}

function getMonToFri(): { iso: string; label: string; weekday: string }[] {
  const now = new Date()
  const day = now.getDay() // 0 Sun
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setHours(0, 0, 0, 0)
  mon.setDate(now.getDate() + diffToMon)
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  return [0, 1, 2, 3, 4].map(i => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    // Use local iso based on campus? Use same calculation
    // Safer to format using campus timezone date
    const campusIso = new Date(d).toLocaleDateString('en-CA', { timeZone: 'Africa/Dar_es_Salaam' })
    return { iso: campusIso, label: String(d.getDate()), weekday: names[i] }
  })
}

function WeeklyGraph({ calendar, streak }: { calendar: any[]; streak?: any }) {
  const week = useMemo(() => getMonToFri(), [])
  // Map calendar by iso date
  const byDate = useMemo(() => {
    const m = new Map<string, any>()
    for (const c of calendar) m.set(c.date, c)
    return m
  }, [calendar])

  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Dar_es_Salaam' })
  const points = useMemo(() => {
    return week.map(w => {
      const entry = byDate.get(w.iso) as any | undefined
      const inMin = minutesFromIso(entry?.checkInAt ?? null)
      const outMin = minutesFromIso(entry?.checkOutAt ?? null)
      return { ...w, entry, inMin, outMin, status: entry?.status ?? null }
    })
  }, [week, byDate])

  // Only show days up to today - future weekdays hidden until that day arrives
  const visiblePoints = useMemo(() => points.filter(p => p.iso <= todayIso), [points, todayIso])
  const displayPoints = visiblePoints.length ? visiblePoints : []
  const hasAny = displayPoints.some(p => p.inMin != null || p.outMin != null)

  // Y scale: fixed 07:00 (420) to 17:30 (1050) for stable graph like reference
  const yMin = 7 * 60
  const yMax = 17.5 * 60
  const yRange = yMax - yMin

  const W = 640
  const H = 340
  const padL = 44
  const padR = 12
  const padT = 12
  const padB = 24
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  function yFor(m: number | null): number | null {
    if (m == null) return null
    const clamped = Math.max(yMin, Math.min(yMax, m))
    const t = (clamped - yMin) / yRange // 0 bottom? We want early at top? Actually earlier = higher? In image higher = larger value. For time, later = lower? Let's keep early at top? No, earlier (07:00) at bottom visually? In image peak high = larger money. For arrival, late is lower down? Actually 08:00 should be higher up than 10:00? Let's invert: 07:00 bottom, 17:00 top? That would make late = top which is intuitive peak. Let's mimic image where higher = bigger Y. So later time = higher. So y = padT + (1 - (m - yMin)/range)*plotH ? Wait that makes 07 bottom. Let's do: 07 bottom => ratio (m - yMin)/range => 0 at 07, 1 at 17. y = padT + plotH*(1 - ratio) => 07 at bottom, 17 at top.
    return padT + plotH * (1 - (m - yMin) / yRange)
  }

  function xFor(idx: number): number {
    const len = displayPoints.length || 1
    if (len === 1) return padL + plotW / 2
    return padL + (idx / (len - 1)) * plotW
  }

  // Build path strings, skipping nulls with gaps
  function buildPath(getVal: (p: any) => number | null): string {
    let d = ''
    let started = false
    displayPoints.forEach((p, i) => {
      const v = getVal(p)
      const y = yFor(v)
      const x = xFor(i)
      if (y == null) {
        started = false
        return
      }
      if (!started) {
        d += `M ${x} ${y}`
        started = true
      } else {
        // smooth cubic? use line
        d += ` L ${x} ${y}`
      }
    })
    return d
  }

  function buildAreaPath(getVal: (p: any) => number | null): string {
    const line = buildPath(getVal)
    if (!line) return ''
    // close to baseline
    const firstIdx = displayPoints.findIndex(p => getVal(p) != null)
    const lastIdx = (() => { for (let i = displayPoints.length - 1; i >= 0; i--) if (getVal(displayPoints[i]) != null) return i; return -1 })()
    if (firstIdx === -1 || lastIdx === -1) return ''
    const x0 = xFor(firstIdx)
    const x1 = xFor(lastIdx)
    const baseline = padT + plotH // 07:00 baseline
    return `${line} L ${x1} ${baseline} L ${x0} ${baseline} Z`
  }

  const inPath = buildPath(p => p.inMin)
  const outPath = buildPath(p => p.outMin)
  const inArea = buildAreaPath(p => p.inMin)
  const outArea = buildAreaPath(p => p.outMin)

  const yLabels = [yMin, 9.5 * 60, 12 * 60, 15 * 60, yMax] // 07:00,09:30,12:00,15:00,17:30
  const yLabelText = (m: number) => {
    const h = Math.floor(m / 60)
    const mm = m % 60 === 0 ? '00' : String(m % 60).padStart(2, '0')
    if (m === 9.5 * 60) return '09:30'
    return `${String(h).padStart(2, '0')}:${mm}`
  }

  const avgIn = (() => {
    const vals = displayPoints.map(p => p.inMin).filter((v): v is number => v != null)
    if (!vals.length) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  })()

  return (
    <div className="home-graph-card">
      {/* Header like image: title + toggles */}
      <div className="home-graph-top">
        <div className="home-graph-title">
          <h3>Weekly arrival</h3>
          <span>Mon — Fri · Africa/Dar_es_Salaam</span>
        </div>
        <div className="home-graph-legend">
          <span className="legend-item checked-in"><i /> Check-in</span>
          <span className="legend-item checked-out"><i /> Check-out</span>
          <span className="legend-avg">{avgIn != null ? `Avg ${shortMinutes(avgIn)}` : 'No data yet'}</span>
        </div>
      </div>

      {/* Mini bar indicators like Matumizi green/yellow bars */}
      <div className="home-graph-bars">
        <div className="mini-bar">
          <span className="dot green" /> <b>Arrivals</b> <small>{displayPoints.filter(p => p.inMin != null).length}/{displayPoints.length} this week</small>
          <div className="bar-track"><i style={{ width: `${displayPoints.length ? (displayPoints.filter(p => p.inMin != null).length / displayPoints.length) * 100 : 0}%`, background: '#22c55e' }} /></div>
        </div>
        <div className="mini-bar amber">
          <span className="dot amber" /> <b>Departures</b> <small>{displayPoints.filter(p => p.outMin != null).length}/{displayPoints.length}</small>
          <div className="bar-track"><i style={{ width: `${displayPoints.length ? (displayPoints.filter(p => p.outMin != null).length / displayPoints.length) * 100 : 0}%`, background: '#f59e0b' }} /></div>
        </div>
      </div>

      <div className="home-graph-wrap">
        {hasAny ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="home-graph-svg" role="img" aria-label="Weekly arrival time graph">
            {/* grid */}
            {yLabels.map(yVal => {
              const y = yFor(yVal)!
              return <line key={yVal} x1={padL} x2={W - padR} y1={y} y2={y} className="grid-line" />
            })}
            {/* vertical grid */}
            {displayPoints.map((_, i) => {
              const x = xFor(i)
              return <line key={i} x1={x} x2={x} y1={padT} y2={padT + plotH} className="grid-line vert" />
            })}

            {/* areas */}
            {inArea && <path d={inArea} className="area in" />}
            {outArea && <path d={outArea} className="area out" />}

            {/* lines */}
            {inPath && <path d={inPath} className="line in" />}
            {outPath && <path d={outPath} className="line out" />}

            {/* points */}
            {displayPoints.map((p, i) => {
              const y = yFor(p.inMin)
              const x = xFor(i)
              if (y == null) return null
              const isToday = p.iso === todayIso
              return <g key={`in-${p.iso}`}><circle cx={x} cy={y} r={isToday ? 6 : 4} className="pt in" /><circle cx={x} cy={y} r={2} fill="white" /></g>
            })}
            {displayPoints.map((p, i) => {
              const y = yFor(p.outMin)
              const x = xFor(i)
              if (y == null) return null
              return <g key={`out-${p.iso}`}><circle cx={x} cy={y} r={4} className="pt out" /></g>
            })}

            {/* Y labels */}
            {yLabels.map(yVal => {
              const y = yFor(yVal)!
              return <text key={yVal} x={padL - 8} y={y + 3} className="y-label">{yLabelText(yVal)}</text>
            })}
            {/* X labels */}
            {displayPoints.map((p, i) => {
              const x = xFor(i)
              const isToday = p.iso === todayIso
              return <text key={p.iso} x={x} y={H - 8} className={`x-label ${isToday ? 'today' : ''}`}>{p.weekday}</text>
            })}
          </svg>
        ) : (
          <div className="home-graph-empty">
            <p>No arrivals yet this week — check in to see your curve build.</p>
            <small>Graph updates automatically after each check-in & check-out (Mon–Fri).</small>
          </div>
        )}
      </div>

      <div className="home-graph-foot">
        <span className="foot-left">
          {displayPoints.length ? `${displayPoints[0].label} ${displayPoints[0].weekday} — ${displayPoints[displayPoints.length-1].label} ${displayPoints[displayPoints.length-1].weekday}` : '—'}
        </span>
        <span className="foot-right">• Live — refreshes every 60s</span>
      </div>

      {/* Day detail chips */}
      <div className="home-day-chips">
        {displayPoints.map(p => {
          const isToday = p.iso === todayIso
          const has = p.inMin != null
          return (
            <div key={p.iso} className={`day-chip ${has ? 'has' : ''} ${isToday ? 'today' : ''} ${p.status === 'LATE' ? 'late' : ''}`}>
              <b>{p.weekday}</b>
              <span className="t">{fmtMinutes(p.inMin)}</span>
              <small>{p.outMin != null ? `out ${shortMinutes(p.outMin)}` : has ? 'no out' : 'absent'}</small>
            </div>
          )
        })}
      </div>
      {streak && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>🔥 {streak.streak ?? 0} day streak · {streak.present ?? 0} early · {streak.late ?? 0} late · {streak.checkedOut ?? 0} check-outs</div>}
    </div>
  )
}

export default function HomePage() {
  const clock = useCampusClock()
  const [summary, setSummary] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [record, setRecord] = useState<any>(null)
  const [streak, setStreak] = useState<any>(null)
  const [calendar, setCalendar] = useState<any[]>([])
  const [revealId, setRevealId] = useState(false)

  const name = summary?.fullName || localStorage.getItem('ccd.name') || 'Student'
  const firstName = name.split(' ')[0]
  const checkedIn = record?.status === 'PRESENT' || record?.status === 'LATE'

  // initial fetch
  useEffect(() => {
    Promise.allSettled([
      api.get('/student/profile/summary'),
      api.get('/student/attendance/active-session'),
      api.get('/student/attendance/current'),
      api.get('/student/attendance/streak').catch(() => ({ data: null })),
    ]).then(([s, sess, rec, st]: any) => {
      if (s.status === 'fulfilled') setSummary(s.value.data)
      if (sess.status === 'fulfilled') setSession(sess.value.data)
      if (rec.status === 'fulfilled') setRecord(rec.value.data.record)
      if (st?.status === 'fulfilled' && st.value?.data) setStreak(st.value.data)
    })
  }, [])

  const refreshCalendar = () => {
    api.get('/student/attendance/calendar?days=14').then(r => setCalendar(r.data?.calendar || [])).catch(() => {})
  }

  useEffect(() => {
    refreshCalendar()
    const id = window.setInterval(() => {
      refreshCalendar()
      api.get('/student/attendance/current').then(r => setRecord(r.data.record)).catch(() => {})
    }, 60_000)
    const onFocus = () => {
      refreshCalendar()
      api.get('/student/attendance/current').then(r => setRecord(r.data.record)).catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [record?.checkInAt, record?.checkOutAt])

  // also refresh when record changes (checked in/out)
  useEffect(() => { refreshCalendar() }, [record])

  const membership = displayMembershipId(summary || {})
  const reg = displayRegistration(summary || {})

  const maskedId = membership === '—' ? '—' : membership.startsWith('CCD') ? membership.slice(0, 7) + ' •••' : '•••• ••••'

  return (
    <div className="edu-home">
      {/* Hero */}
      <section className="edu-hero-card">
        <div className="edu-hero-main">
          <h1>{campusGreeting(clock)}, {firstName}</h1>
          {checkedIn && <p className="edu-hero-sub">You're checked in for today's session.</p>}
          <p className="edu-hero-date">{formatCampusDate(clock)} · {formatCampusTime(clock)}</p>
          <div className="edu-pills">
            <span className="edu-pill"><b>{streak?.present ?? 0} early</b> · {streak?.late ?? 0} late</span>
            <span className="edu-pill edu-pill-accent">🔥 {streak?.streak ?? 0} streak</span>
            <span className="edu-pill">{streak?.checkedOut ?? 0} outs</span>
          </div>
        </div>
        <div className="edu-hero-side">
          <Link to="/student/attendance" className="edu-hero-cta">
            <span>{checkedIn ? 'Check out' : 'Check in'}</span>
            <i>→</i>
          </Link>
          <p className="edu-hero-hint">{checkedIn ? 'You can check out from 15:00' : 'Tap to open scanner'}</p>
        </div>
      </section>

      {/* Weekly graph — arrival time vs day */}
      <WeeklyGraph calendar={calendar} streak={streak} />

      {/* Shortcut grid — like Lipa/Bili tiles in reference */}
      <section className="home-quick-grid">
        <Link to="/student/attendance" className="q-tile primary"><i>✓</i><span>{checkedIn ? 'Check out' : 'Check in'}</span></Link>
        <Link to="/student/courses" className="q-tile"><i>📚</i><span>Courses</span></Link>
        <Link to="/student/messages" className="q-tile"><i>✉</i><span>Messages</span></Link>
        <Link to="/student/profile" className="q-tile"><i>👤</i><span>Profile</span></Link>
        <Link to="/student/attendance" className="q-tile"><i>◎</i><span>QR Scan</span></Link>
        <Link to="/student/profile" className="q-tile"><i>⚙</i><span>Settings</span></Link>
      </section>

    </div>
  )
}
