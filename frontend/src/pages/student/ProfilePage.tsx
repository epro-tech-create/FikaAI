import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { clearAuthentication } from '../../lib/auth'
import { displayMembershipId, displayRegistration, normalizeMembershipIdInput, membershipIdError } from '../../lib/studentId'
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
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editMembershipId, setEditMembershipId] = useState('')
  const [editRegistration, setEditRegistration] = useState('')
  const [editing, setEditing] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [editErr, setEditErr] = useState('')
  useEffect(() => {
    api.get('/student/profile/summary').then(r => {
      setSummary(r.data)
      setEditName(r.data?.fullName || '')
      setEditEmail(r.data?.email || '')
      setEditMembershipId(r.data?.membershipId || '')
      setEditRegistration(r.data?.registrationNumber || '')
    }).catch(() => {})
    api.get('/student/face-enrollment/status').then(r => setEnrolled(Boolean(r.data.enrolled))).catch(() => {})
  }, [])
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setEditErr(''); setEditMsg('')
    const midErr = membershipIdError(editMembershipId)
    if (midErr) { setEditErr(midErr); return }
    if (!editName.trim() && !editEmail.trim() && !editMembershipId.trim() && !editRegistration.trim()) { setEditErr('Enter at least one field to update.'); return }
    if (editRegistration.trim() && !/^\d{3,50}$/.test(editRegistration.trim())) { setEditErr('Registration number must contain only digits (3-50).'); return }
    setBusy(true)
    try {
      const payload: any = {}
      if (editName.trim()) payload.fullName = editName.trim()
      if (editEmail.trim()) payload.email = editEmail.trim()
      // membershipId: allow clearing by sending empty? backend treats empty as None
      if (editMembershipId.trim() !== (summary?.membershipId || '')) payload.membershipId = editMembershipId.trim() || null
      if (editRegistration.trim() !== (summary?.registrationNumber || '')) payload.registrationNumber = editRegistration.trim()
      if (Object.keys(payload).length === 0) { setEditErr('No changes to save.'); return }
      const res = await api.patch('/student/profile', payload)
      setEditMsg('Profile updated successfully.')
      setSummary((s:any)=> ({...s, fullName: res.data?.fullName || editName, email: res.data?.email || editEmail, membershipId: (res.data?.membershipId ?? (editMembershipId.trim() || null)), registrationNumber: res.data?.registrationNumber || editRegistration.trim() }))
      if (res.data?.fullName) localStorage.setItem('ccd.name', res.data.fullName)
      setEditing(false)
    } catch (e:any) { setEditErr(e?.response?.data?.error?.message || 'Failed to update profile.') } finally { setBusy(false) }
  }
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
      setTimeout(() => setShowPw(false), 1200)
    } catch (e:any) {
      setErr(e?.response?.data?.error?.message || e?.response?.data?.message || 'Failed to change password.')
    } finally { setBusy(false) }
  }
  const initial = (summary?.fullName || localStorage.getItem('ccd.name') || 'S').slice(0,1).toUpperCase()
  const fullName = summary?.fullName || localStorage.getItem('ccd.name') || 'Student'
  return (
    <div className="profile-page">
      <div className="portal-heading"><div><p>PROFILE</p><h1>Settings</h1><span>Account and preferences — update your details and password securely.</span></div></div>
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
          <div className="profile-actions" style={{display:'grid',gap:10}}>
            <button onClick={() => { setEditing(v=>!v); setEditErr(''); setEditMsg('') }} className="dash-btn ghost full" style={{justifyContent:'center'}}>{editing ? 'Cancel edit' : 'Edit details'}</button>
            <button onClick={() => setShowPw(true)} className="dash-btn primary full" style={{justifyContent:'center'}}>Change password</button>
            <button onClick={() => { clearAuthentication(); window.location.href = '/login' }} className="dash-btn ghost full" style={{justifyContent:'center',color:'#ff7d8a'}}>Sign out</button>
          </div>
          {editing && <form onSubmit={saveProfile} className="profile-form" style={{marginTop:16,borderTop:'1px solid var(--line)',paddingTop:16}}>
            <label>Full name
              <input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="Your full name" minLength={3} maxLength={200} />
            </label>
            <label>Email
              <input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)} placeholder="your@email.com" />
            </label>
            <label>Student ID <small style={{textTransform:'none',letterSpacing:0,fontWeight:400}}>(CCD-2026-015)</small>
              <input value={editMembershipId} onChange={e=>setEditMembershipId(normalizeMembershipIdInput(e.target.value))} placeholder="CCD-2026-015" maxLength={12} />
            </label>
            <label>Registration number
              <input value={editRegistration} onChange={e=>setEditRegistration(e.target.value.replace(/\D/g,'').slice(0,50))} inputMode="numeric" placeholder="e.g. 250242491538" />
            </label>
            {editErr && <div className="error">{editErr}</div>}
            {editMsg && <div className="success">{editMsg}</div>}
            <button disabled={busy} className="dash-btn primary full" type="submit" style={{marginTop:4}}>{busy ? 'Saving…' : 'Save details'}</button>
          </form>}
          {!editing && editMsg && <div className="success" style={{marginTop:12}}>{editMsg}</div>}
          {editErr && !editing && <div className="error" style={{marginTop:12}}>{editErr}</div>}
        </article>

        <article className="content-card" style={{padding:20, display:'flex', flexDirection:'column', gap:14}}>
          <div>
            <h3 style={{margin:'0 0 6px', font:'700 16px Space Grotesk'}}>Security</h3>
            <p className="form-hint" style={{margin:0}}>Keep your account safe. Use a strong password with 8+ characters, uppercase, lowercase and a number.</p>
          </div>
          <div style={{display:'grid', gap:10}}>
            <div style={{padding:'14px 16px', borderRadius:12, background:'var(--panel-2)', border:'1px solid var(--line)', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12}}>
              <div><b style={{display:'block', fontSize:13}}>Password</b><small style={{color:'var(--muted)'}}>Last updated — hidden for security</small></div>
              <span style={{color:'var(--muted)', fontSize:12}}>••••••••</span>
            </div>
            <button onClick={() => setShowPw(true)} className="dash-btn primary full">Change password</button>
            <p style={{margin:0, color:'var(--muted)', fontSize:11, lineHeight:1.5}}>Changing password will keep you signed in on this device. You will use the new password next time you log in.</p>
          </div>
        </article>
      </section>

      {showPw && (
        <div className="portal-dialog-backdrop" onClick={() => setShowPw(false)} role="presentation">
          <div className="portal-dialog content-card" role="dialog" aria-modal="true" aria-labelledby="pw-title" onClick={e=>e.stopPropagation()} style={{maxWidth:440, width:'92%', padding:22}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
              <h3 id="pw-title" style={{margin:0, font:'700 18px Space Grotesk'}}>Change password</h3>
              <button onClick={() => setShowPw(false)} aria-label="Close" style={{border:'1px solid var(--line)', background:'var(--panel-2)', color:'var(--text)', borderRadius:8, width:32, height:32, cursor:'pointer'}}>×</button>
            </div>
            <p className="form-hint">Use at least 8 characters with uppercase, lowercase and a number.</p>
            <form onSubmit={changePw} className="profile-form" style={{marginTop:12}}>
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
              <div style={{display:'flex', gap:10, marginTop:4}}>
                <button type="button" onClick={() => setShowPw(false)} className="secondary-button" style={{flex:1}}>Cancel</button>
                <button disabled={busy} className="dash-btn primary full" type="submit" style={{flex:1}}>{busy ? 'Updating…' : 'Update password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="content-card profile-about">
        <h3>About</h3>
        <p>CCD-Attendance — QR + GPS. Face ID optional. Verified inside 300 m of DIT RAFIC Building.</p>
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
