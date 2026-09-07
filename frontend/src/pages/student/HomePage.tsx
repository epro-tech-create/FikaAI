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
  const dateLabel = clock.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Africa/Dar_es_Salaam' }).replace(/\//g, '.')

  const events = [
    {
      date: dateLabel,
      time: checkedIn && record?.checkInAt ? formatCampusTime(record.checkInAt) : 'All day',
      title: session?.title || 'Daily RAFIC Attendance',
      meta: session?.locationName ? `${session.locationName} · DIT RAFIC Building` : 'DIT RAFIC Building',
    },
    {
      date: dateLabel,
      time: checkedIn
        ? `${session?.expectedEnd || '14:00'} – ${session?.checkOutClose || '16:00'}`
        : `${session?.checkInOpen || '08:00'} – ${session?.checkInClose || '15:00'}`,
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
  const peakIndex = week.findIndex(p => p.d === peak.d)

  const actions = [
    { to: '/student/attendance', title: 'Check in', sub: checkedIn ? 'Checked in ✓' : 'Scan QR', icon: '◉' },
    { to: '/student/face-enrollment', title: 'Face ID', sub: enrolled ? 'Enrolled' : 'Enrol now', icon: '◎' },
    { to: '/student/messages', title: 'Messages', sub: msgs.length ? `${msgs.length} new` : 'Inbox', icon: '✉' },
    { to: '/student/profile', title: 'Settings', sub: 'Profile & theme', icon: '⚙' },
  ]

  return (
    <div className="edu-home">
      {/* Hero */}
      <section className="edu-hero-card">
        <div className="edu-hero-main">
          <h1>{campusGreeting(clock)}, {firstName}</h1>
          <p className="edu-hero-sub">{checkedIn ? "You're checked in for today's session." : 'Scan the venue QR and verify GPS to mark attendance.'}</p>
          <p className="edu-hero-date">{formatCampusDate(clock)} · {formatCampusTime(clock)}</p>

          <div className="edu-pills">
            <span className="edu-pill"><b>{streak?.present ?? 2} early</b> · {streak?.late ?? 0} late</span>
            <span className="edu-pill edu-pill-accent">🔥 {streak?.streak ?? 0} day streak</span>
            <span className="edu-pill">{streak?.checkedOut ?? 2} check-outs</span>
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

      {/* Events + Timing grid */}
      <div className="edu-grid">
        <section className="edu-card">
          <header className="edu-card-head">
            <h2>Events</h2>
            <Link to="/student/attendance" className="edu-card-link">More →</Link>
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

        <section className="edu-card edu-quick-card">
          <header className="edu-card-head">
            <h2>Quick actions</h2>
          </header>
          <ul className="edu-actions">
            {actions.map(a => (
              <li key={a.to}>
                <Link to={a.to}>
                  <span className="edu-action-icon">{a.icon}</span>
                  <div className="edu-action-text">
                    <b>{a.title}</b>
                    <small>{a.sub}</small>
                  </div>
                  <span className="edu-action-arrow">›</span>
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

      {/* Timing & progress */}
      <section className="edu-card edu-timing">
        <header className="edu-card-head">
          <h2>Timing & progress</h2>
          <span className="edu-timing-badge">Week overview</span>
        </header>
        <div className="edu-timing-body">
          <div className="edu-chart-wrap">
            <svg viewBox="0 0 340 140" className="edu-chart" role="img" aria-label="Weekly activity">
              {/* grid lines */}
              <line x1="20" y1="20" x2="20" y2="110" stroke="var(--line)" strokeWidth="1" opacity="0.5" />
              <line x1="20" y1="110" x2="320" y2="110" stroke="var(--line)" strokeWidth="1" opacity="0.5" />
              {/* peak label */}
              <text x={30 + peakIndex * 44} y={112 - peak.v} textAnchor="middle" className="edu-peak">{peak.v}%</text>
              {/* line */}
              <polyline
                fill="none"
                stroke="#3b9cff"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={week.map((p, i) => `${30 + i * 44},${108 - p.v}`).join(' ')}
              />
              {/* dots */}
              {week.map((p, i) => (
                <circle key={p.d} cx={30 + i * 44} cy={108 - p.v} r={p.d === peak.d ? 7 : 4} fill="#3b9cff" stroke="var(--card)" strokeWidth="2" />
              ))}
            </svg>
            <div className="edu-chart-labels">
              {week.map(p => <span key={p.d} className={p.d === peak.d ? 'is-peak' : ''}>{p.d}</span>)}
            </div>
          </div>
          <div className="edu-bars">
            {progress.map(p => (
              <div key={p.label} className="edu-bar-row">
                <div className="edu-bar-meta"><span>{p.label}</span><b>{p.value}%</b></div>
                <div className="edu-bar-track"><i style={{ width: `${p.value}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="edu-faq">
        <HelpFaq />
      </div>
    </div>
  )
}
