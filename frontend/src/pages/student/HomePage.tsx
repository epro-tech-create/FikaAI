import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { useCampusClock } from '../../hooks/useCampusClock'
import { campusGreeting, formatCampusDate, formatCampusTime } from '../../lib/campusTime'

type Msg = { id: string; title: string; body: string; time: string; unread?: boolean }

export default function HomePage() {
  const clock = useCampusClock()
  const [summary, setSummary] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [record, setRecord] = useState<any>(null)
  const [enrolled, setEnrolled] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])

  useEffect(() => {
    Promise.allSettled([
      api.get('/student/profile/summary'),
      api.get('/student/attendance/active-session'),
      api.get('/student/attendance/current'),
      api.get('/student/face-enrollment/status'),
      api.get('/student/messages'),
    ]).then(([s, sess, rec, face, messages]) => {
      if (s.status === 'fulfilled') setSummary(s.value.data)
      if (sess.status === 'fulfilled') setSession(sess.value.data)
      if (rec.status === 'fulfilled') setRecord(rec.value.data.record)
      if (face.status === 'fulfilled') setEnrolled(Boolean(face.value.data.enrolled))
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
  const dateLabel = clock.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Africa/Dar_es_Salaam' }).replace(/\//g, '.')

  const events = [
    {
      date: dateLabel,
      time: checkedIn && record?.checkInAt ? formatCampusTime(record.checkInAt) : 'All day',
      title: session?.title || 'RAFIC Attendance',
      meta: session?.locationName || 'DIT RAFIC',
    },
    {
      date: dateLabel,
      time: checkedIn
        ? `${session?.expectedEnd || '14:00'} – ${session?.checkOutClose || '16:00'}`
        : `${session?.checkInOpen || '08:00'} – ${session?.checkInClose || '14:00'}`,
      title: checkedIn ? 'Check-out window' : 'Check-in window',
      meta: 'Venue QR + GPS',
    },
    ...(msgs[0] ? [{ date: dateLabel, time: msgs[0].time || 'Today', title: msgs[0].title, meta: 'Message' }] : []),
  ].slice(0, 3)

  const progress = [
    { label: 'Check-in', value: checkedIn ? 100 : 20 },
    { label: 'Face ID', value: enrolled ? 100 : 35 },
    { label: 'Messages', value: msgs.length ? Math.min(100, msgs.length * 30) : 15 },
  ]

  const week = [
    { d: 'Mon', v: 42 },
    { d: 'Tue', v: 58 },
    { d: 'Wed', v: 35 },
    { d: 'Thu', v: 72 },
    { d: 'Fri', v: checkedIn ? 88 : 50 },
    { d: 'Sat', v: 28 },
    { d: 'Sun', v: 18 },
  ]
  const peak = week.reduce((a, b) => (b.v > a.v ? b : a), week[0])

  const actions = [
    { to: '/student/attendance', title: 'Check in', sub: checkedIn ? 'Checked in' : 'Scan QR' },
    { to: '/student/face-enrollment', title: 'Face ID', sub: enrolled ? 'Enrolled' : 'Enrol' },
    { to: '/student/messages', title: 'Messages', sub: 'Inbox' },
    { to: '/student/profile', title: 'Settings', sub: 'Profile' },
  ]

  return (
    <div className="edu-home">
      <section className="edu-hero">
        <div>
          <h1>{campusGreeting(clock)}, {firstName}</h1>
          <p>{checkedIn ? "You're checked in for today's session." : 'Scan the venue QR and verify GPS to mark attendance.'}</p>
          <p>{formatCampusDate(clock)} · {formatCampusTime(clock)}</p>
        </div>
        <Link to="/student/attendance" className="edu-hero-btn">{checkedIn ? 'Check out' : 'Check in'} →</Link>
      </section>

      <section className="edu-block">
        <header className="edu-block-head">
          <h2>Events</h2>
          <Link to="/student/attendance">More →</Link>
        </header>
        <div className="edu-events">
          {events.map((e, i) => (
            <article key={i} className="edu-event">
              <div className="edu-event-date">
                <b>{e.date}</b>
                <span>{e.time}</span>
              </div>
              <div className="edu-event-body">
                <b>{e.title}</b>
                <span>{e.meta}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="edu-split">
        <section className="edu-block">
          <header className="edu-block-head">
            <h2>Timing & progress</h2>
          </header>
          <div className="edu-progress-row">
            <article className="edu-card edu-chart">
              <svg viewBox="0 0 280 120" className="edu-line" aria-label="Weekly activity">
                <polyline
                  fill="none"
                  stroke="var(--blue)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={week.map((p, i) => `${20 + i * 40},${100 - p.v}`).join(' ')}
                />
                {week.map((p, i) => (
                  <circle key={p.d} cx={20 + i * 40} cy={100 - p.v} r={p.d === peak.d ? 5 : 0} fill="var(--blue)" />
                ))}
                <text x={20 + week.findIndex(p => p.d === peak.d) * 40} y={100 - peak.v - 12} textAnchor="middle" className="edu-peak">{peak.v}%</text>
                {week.map((p, i) => (
                  <text key={p.d} x={20 + i * 40} y={116} textAnchor="middle" className="edu-axis">{p.d}</text>
                ))}
              </svg>
            </article>
            <article className="edu-card edu-bars">
              {progress.map(p => (
                <div key={p.label} className="edu-bar-row">
                  <div className="edu-bar-meta"><span>{p.label}</span><b>{p.value}%</b></div>
                  <div className="edu-bar-track"><i style={{ width: `${p.value}%` }} /></div>
                </div>
              ))}
            </article>
          </div>
        </section>

        <section className="edu-block">
          <header className="edu-block-head">
            <h2>Quick actions</h2>
          </header>
          <ul className="edu-courses edu-courses-grid">
            {actions.map(a => (
              <li key={a.to}>
                <Link to={a.to}>
                  <span className="edu-course-icon" />
                  <div>
                    <b>{a.title}</b>
                    <small>{a.sub}</small>
                  </div>
                  <span aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/student/attendance" className="edu-cta">
            <span>{checkedIn ? 'Ready to check out?' : 'Start check-in'}</span>
            <b>{checkedIn ? 'Check out →' : 'Check in →'}</b>
          </Link>
        </section>
      </div>
    </div>
  )
}
