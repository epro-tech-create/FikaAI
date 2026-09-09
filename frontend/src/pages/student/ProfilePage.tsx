import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { clearAuthentication } from '../../lib/auth'
import { displayMembershipId, displayRegistration } from '../../lib/studentId'
import ThemeToggle from '../../components/ThemeToggle'
import HelpFaq from '../../components/HelpFaq'

export default function ProfilePage() {
  const [summary, setSummary] = useState<any>(null)
  const [enrolled, setEnrolled] = useState<boolean | null>(null)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [conf, setConf] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.get('/student/profile/summary').then(r => setSummary(r.data)).catch(() => {})
    api.get('/student/face-enrollment/status').then(r => setEnrolled(Boolean(r.data.enrolled))).catch(() => {})
  }, [])
  async function changePw(e: React.FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (next !== conf) { setErr('New passwords do not match.'); return }
    if (next.length < 8 || !/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/\d/.test(next)) { setErr('Use at least 8 characters with uppercase, lowercase and a number.'); return }
    setBusy(true)
    try {
      await api.post('/student/profile/change-password', { currentPassword: cur, newPassword: next, confirmPassword: conf })
      setMsg('Password changed successfully.')
      setCur(''); setNext(''); setConf('')
    } catch (e:any) {
      setErr(e?.response?.data?.error?.message || e?.response?.data?.message || 'Failed to change password.')
    } finally { setBusy(false) }
  }
  const initial = (summary?.fullName || localStorage.getItem('ccd.name') || 'S').slice(0,1).toUpperCase()
  const fullName = summary?.fullName || localStorage.getItem('ccd.name') || 'Student'
  return (
    <div className="profile-page">
      <div className="portal-heading"><div><p>PROFILE</p><h1>Settings</h1><span>Account and preferences — update your password securely.</span></div></div>
      <section className="profile-grid">
        <article className="content-card profile-card">
          <div className="profile-hero">
            <div className="profile-avatar">{initial}</div>
            <h3>{fullName}</h3>
            <small>{summary?.status || 'ACTIVE'} · {enrolled == null ? '—' : enrolled ? 'Face ID enrolled ✓' : 'Face ID not enrolled'}</small>
            <span className="profile-email">{summary?.email || 'No email on file'}</span>
          </div>
          <div className="profile-meta">
            <div><span>Student ID</span><b>{displayMembershipId(summary || {})}</b></div>
            <div><span>Registration</span><b>{displayRegistration(summary || {})}</b></div>
            <div><span>Theme</span><span className="theme-row"><ThemeToggle /> <small>Light / Dark</small></span></div>
          </div>
          <div className="profile-actions">
            <button onClick={() => { clearAuthentication(); window.location.href = '/login' }} className="dash-btn ghost full">Sign out</button>
          </div>
        </article>

        <article className="content-card profile-form-card">
          <h3>Change password</h3>
          <p className="form-hint">Use at least 8 characters with uppercase, lowercase and a number.</p>
          <form onSubmit={changePw} className="profile-form">
            <label>Current password
              <input type="password" value={cur} onChange={e=>setCur(e.target.value)} placeholder="Current password" required />
            </label>
            <label>New password
              <input type="password" value={next} onChange={e=>setNext(e.target.value)} placeholder="New (8+ chars, Aa + 1)" required />
            </label>
            <label>Confirm new password
              <input type="password" value={conf} onChange={e=>setConf(e.target.value)} placeholder="Repeat new password" required />
            </label>
            {err && <div className="error">{err}</div>}
            {msg && <div className="success">{msg}</div>}
            <button disabled={busy} className="dash-btn primary full" type="submit">{busy ? 'Updating…' : 'Update password'}</button>
          </form>
        </article>
      </section>

      <section className="content-card profile-about">
        <h3>About</h3>
        <p>CCD-Attendance — QR + GPS. Face ID optional. Verified inside 100 m of DIT RAFIC Building.</p>
        <ul className="about-grid">
          <li><b>08:00–15:00</b><span>Check-in</span></li>
          <li><b>15:00–17:00</b><span>Check-out</span></li>
          <li><b>08:00–09:30</b><span>Early</span></li>
          <li><b>09:30 →</b><span>Late</span></li>
          <li><b>Static QR</b><span>Same all days</span></li>
          <li><b>Encrypted</b><span>Face ID</span></li>
        </ul>
      </section>

      <div style={{ marginTop:16 }}>
        <HelpFaq />
      </div>
    </div>
  )
}
