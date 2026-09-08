import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { useCampusClock } from '../../hooks/useCampusClock'
import { campusGreeting, formatCampusDate, formatCampusTime } from '../../lib/campusTime'
import HelpFaq from '../../components/HelpFaq'

type Msg = { id: string; title: string; body: string; time: string; unread?: boolean }

export default function HomePage() {
  const clock = useCampusClock()
  const [summary, setSummary] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [record, setRecord] = useState<any>(null)
  const [enrolled, setEnrolled] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [streak, setStreak] = useState<any>(null)

  useEffect(() => {
    Promise.allSettled([
      api.get('/student/profile/summary'),
      api.get('/student/attendance/active-session'),
      api.get('/student/attendance/current'),
      api.get('/student/face-enrollment/status'),
      api.get('/student/messages'),
      api.get('/student/attendance/streak').catch(() => ({ data: null })),
    ]).then(([s, sess, rec, face, messages, st]: any) => {
      if (s.status === 'fulfilled') setSummary(s.value.data)
      if (sess.status === 'fulfilled') setSession(sess.value.data)
      if (rec.status === 'fulfilled') setRecord(rec.value.data.record)
      if (face.status === 'fulfilled') setEnrolled(Boolean(face.value.data.enrolled))
      if (st?.status === 'fulfilled' && st.value?.data) setStreak(st.value.data)
      if (messages.status === 'fulfilled' && Array.isArray(messages.value.data)) setMsgs(messages.value.data.slice(0, 3))
      else setMsgs([
        { id: '1', title: 'Welcome to CCD-Attendance', body: 'Scan the wall QR at RAFIC to check in.', time: 'Today' },
        { id: '2', title: 'GPS tip', body: 'Allow precise location inside 100 m.', time: 'Yesterday' },
      ])
    })
  }, [])

  const name = summary?.fullName || localStorage.getItem('ccd.name') || 'Student'
  const firstName = name.split(' ')[0]
  const checkedIn = record?.status === 'PRESENT' || record?.status === 'LATE'
  const [calendar, setCalendar] = useState<any[]>([])

  useEffect(() => {
    api.get('/student/attendance/calendar?days=84').then(r => setCalendar(r.data?.calendar || [])).catch(() => {})
  }, [record])

  const dotColor = (dot: string) => {
    if (dot === 'blue') return { background: 'var(--blue)', borderColor: 'var(--blue)', opacity: 1 }
    if (dot === 'faded') return { background: 'color-mix(in srgb, var(--blue) 42%, transparent)', borderColor: 'color-mix(in srgb, var(--blue) 35%, var(--line))', opacity: 1 }
    return { background: 'transparent', borderColor: 'var(--line)', opacity: 1 }
  }

  return (
    <div className="edu-home">
      {/* Hero */}
      <section className="edu-hero-card">
        <div className="edu-hero-main">
          <h1>{campusGreeting(clock)}, {firstName}</h1>
          <p className="edu-hero-sub">{checkedIn ? "You're checked in for today's session." : 'Scan the venue QR and verify GPS to mark attendance.'}</p>
          <p className="edu-hero-date">{formatCampusDate(clock)} · {formatCampusTime(clock)}</p>

          <div className="edu-pills">
            <span className="edu-pill"><b>{streak?.present ?? 0} early</b> · {streak?.late ?? 0} late</span>
            <span className="edu-pill edu-pill-accent">🔥 {streak?.streak ?? 0} day streak</span>
            <span className="edu-pill">{streak?.checkedOut ?? 0} check-outs</span>
          </div>
          <Link to="/student/attendance" className="edu-inline-link">Check in →</Link>
        </div>
        <div className="edu-hero-side">
          <Link to="/student/attendance" className="edu-hero-cta">
            <span>{checkedIn ? 'Check out' : 'Check in'}</span>
            <i>→</i>
          </Link>
          <p className="edu-hero-hint">{checkedIn ? 'You can check out from 15:00' : 'Tap to open attendance scanner'}</p>
        </div>
      </section>

      {/* Timing & progress - Habits dot grid (one dot = one day) */}
      <section className="edu-card" style={{ padding: 18 }}>
        <header className="edu-card-head" style={{ marginBottom: 12 }}>
          <h2>Timing & progress</h2>
          <span style={{ fontSize:10, color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' }}>Last 12 weeks · one dot = one day</span>
        </header>

        {/* Legend */}
        <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12, fontSize:10, color:'var(--muted)' }}>
          <span style={{ display:'flex', alignItems:'center', gap:6 }}><i style={{ width:10, height:10, borderRadius:3, background:'var(--blue)', border:'1px solid var(--blue)', display:'inline-block' }} /> checked in & out</span>
          <span style={{ display:'flex', alignItems:'center', gap:6 }}><i style={{ width:10, height:10, borderRadius:3, background:'color-mix(in srgb, var(--blue) 42%, transparent)', border:'1px solid color-mix(in srgb, var(--blue) 35%, var(--line))', display:'inline-block' }} /> only check-in</span>
          <span style={{ display:'flex', alignItems:'center', gap:6 }}><i style={{ width:10, height:10, borderRadius:3, background:'transparent', border:'1px solid var(--line)', display:'inline-block' }} /> absent</span>
          <span style={{ marginLeft:'auto', color:'var(--muted)', fontSize:11 }}>{calendar.filter(c=>c.dot==='blue').length} full · {calendar.filter(c=>c.dot==='faded').length} partial</span>
        </div>

        {/* Dot grid - Habits: responsive, fewer boxes on PC/tablet */}
        {calendar.length ? (
          <div className="habit-grid" style={{ display:'grid', gridTemplateColumns:'repeat(12, 1fr)', gap:6 }}>
            {Array.from({ length: 12 }).map((_, col) => (
              <div key={col} className="habit-col" style={{ display:'grid', gap:6 }}>
                {calendar.slice(col*7, col*7+7).map((d:any) => {
                  const s = dotColor(d.dot)
                  return (
                    <div
                      key={d.date}
                      title={`${d.date}: ${d.status || 'Absent'}${d.checkInAt ? ' '+d.checkInAt.slice(11,16) : ''}`}
                      style={{
                        width:'100%', aspectRatio:'1', borderRadius:4,
                        background: s.background, border:`1px solid ${s.borderColor}`, opacity: s.opacity,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Loading progress...</div>
        )}
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:10, fontSize:10, color:'var(--muted)' }}>
          <span>{calendar[0]?.date || ''}</span><span>Today</span>
        </div>
      </section>

      <div className="edu-faq">
        <HelpFaq />
      </div>
    </div>
  )
}
