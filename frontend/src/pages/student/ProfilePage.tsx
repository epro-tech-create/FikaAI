import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  return (
    <div>
      <div className="portal-heading"><div><p>PROFILE</p><h1>Settings</h1><span>Account and preferences — update your password securely.</span></div></div>
      <section className="profile-grid" style={{ display:'grid', gridTemplateColumns:'1.15fr .85fr', gap:16 }}>
        <article className="content-card profile-card" style={{ padding:22 }}>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            <div className="profile-avatar" style={{ width:56, height:56, fontSize:20, borderRadius:16, background:'linear-gradient(135deg,var(--blue),#6ec1ff)', color:'white', display:'grid', placeItems:'center' }}>{(summary?.fullName || localStorage.getItem('ccd.name') || 'S').slice(0,1).toUpperCase()}</div>
            <div>
              <h3 style={{ margin:0 }}>{summary?.fullName || localStorage.getItem('ccd.name') || 'Student'}</h3>
              <small style={{ color:'var(--muted)' }}>{summary?.status || 'ACTIVE'} · {enrolled == null ? '—' : enrolled ? 'Face ID enrolled ✓' : 'Face ID not enrolled'}</small>
            </div>
          </div>
          <div className="profile-meta" style={{ marginTop:16 }}>
            <div><span>Student ID</span><b>{displayMembershipId(summary || {})}</b></div>
            <div><span>Registration</span><b>{displayRegistration(summary || {})}</b></div>
            <div><span>Email</span><b>{summary?.email || '—'}</b></div>
            <div><span>Theme</span><span style={{display:'inline-flex',alignItems:'center',gap:8}}><ThemeToggle /> <small>Light / Dark</small></span></div>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:16}}>
            <button onClick={() => { clearAuthentication(); window.location.href = '/login' }} className="dash-btn ghost">Sign out</button>
          </div>
        </article>

        <article className="content-card" style={{ padding:20 }}>
          <h3 style={{ margin:'0 0 6px' }}>Change password</h3>
          <p style={{ color:'var(--muted)', fontSize:12, margin:'0 0 14px' }}>Use at least 8 characters with uppercase, lowercase and a number.</p>
          <form onSubmit={changePw} style={{ display:'grid', gap:10 }}>
            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)' }}>Current password
              <input type="password" value={cur} onChange={e=>setCur(e.target.value)} placeholder="Current" required style={{ width:'100%', marginTop:6, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--input)', color:'var(--text)' }} />
            </label>
            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)' }}>New password
              <input type="password" value={next} onChange={e=>setNext(e.target.value)} placeholder="New (8+ chars, Aa + 1)" required style={{ width:'100%', marginTop:6, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--input)', color:'var(--text)' }} />
            </label>
            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)' }}>Confirm new password
              <input type="password" value={conf} onChange={e=>setConf(e.target.value)} placeholder="Repeat new password" required style={{ width:'100%', marginTop:6, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--input)', color:'var(--text)' }} />
            </label>
            {err && <div className="error" style={{ margin:0, padding:'10px 12px', fontSize:12 }}>{err}</div>}
            {msg && <div className="success" style={{ margin:0, padding:'10px 12px', fontSize:12 }}>{msg}</div>}
            <button disabled={busy} className="dash-btn primary" type="submit" style={{ marginTop:4 }}>{busy ? 'Updating…' : 'Update password'}</button>
          </form>
        </article>
      </section>

      <section className="content-card" style={{ padding:18, marginTop:16 }}>
        <h3 style={{ margin:'0 0 8px' }}>About</h3>
        <p style={{color:'var(--muted)',fontSize:13,lineHeight:1.6}}>CCD-Attendance — QR + GPS. Face ID optional. Verified inside 100 m of DIT RAFIC Building.</p>
        <ul style={{marginTop:10,paddingLeft:18,color:'var(--muted)',fontSize:12,lineHeight:1.8, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 16px'}}>
          <li>Check-in 08:00–15:00</li><li>Check-out 15:00–17:00</li>
          <li>Early 08:00–09:30</li><li>Late from 09:30</li>
          <li>Same QR all days</li><li>Encrypted Face ID</li>
        </ul>
      </section>

      <div style={{ marginTop:16 }}>
        <HelpFaq />
      </div>
    </div>
  )
}
