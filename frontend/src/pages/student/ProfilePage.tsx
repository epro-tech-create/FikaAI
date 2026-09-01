import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { clearAuthentication } from '../../lib/auth'
import ThemeToggle from '../../components/ThemeToggle'

export default function ProfilePage() {
  const [summary, setSummary] = useState<any>(null)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  useEffect(() => {
    api.get('/student/profile/summary').then(r => setSummary(r.data)).catch(() => {})
    api.get('/student/face-enrollment/status').then(r => setEnrolled(Boolean(r.data.enrolled))).catch(() => {})
  }, [])
  return (
    <div>
      <div className="portal-heading"><div><p>PROFILE</p><h1>Settings</h1><span>Account and preferences.</span></div></div>
      <section className="profile-grid">
        <article className="content-card profile-card">
          <div className="profile-avatar">{(summary?.fullName || localStorage.getItem('ccd.name') || 'S').slice(0,1).toUpperCase()}</div>
          <h3>{summary?.fullName || localStorage.getItem('ccd.name') || 'Student'}</h3>
          <small>{summary?.registrationNumber || '—'} · {summary?.status || 'ACTIVE'}</small>
          <div className="profile-meta">
            <div><span>Email</span><b>{summary?.email || '—'}</b></div>
            <div><span>Face ID</span><b>{enrolled == null ? '—' : enrolled ? 'Enrolled ✓' : 'Not enrolled'}</b></div>
            <div><span>Theme</span><span style={{display:'inline-flex',alignItems:'center',gap:8}}><ThemeToggle /> <small>Light / Dark</small></span></div>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}>
            <Link to="/student/face-enrollment" className="dash-btn primary">Face enrolment</Link>
            <button onClick={() => { clearAuthentication(); window.location.href = '/login' }} className="dash-btn ghost">Sign out</button>
          </div>
        </article>
        <article className="content-card" style={{padding:20}}>
          <h3>About</h3>
          <p style={{color:'var(--muted)',fontSize:13,lineHeight:1.6}}>CCD-Attendance — QR + GPS. Face ID optional. Verified inside 100 m of DIT RAFIC Building.</p>
          <ul style={{marginTop:12,paddingLeft:18,color:'var(--muted)',fontSize:13,lineHeight:1.8}}>
            <li>Check-in 08:00–14:00, check-out 14:00–16:00</li>
            <li>Arrive 09:00–11:00 early; late from 11:00</li>
            <li>Same QR all days</li>
            <li>Encrypted Face ID if enrolled</li>
          </ul>
        </article>
      </section>
    </div>
  )
}
