import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearAuthentication } from '../../lib/auth'
import ThemeToggle from '../../components/ThemeToggle'
import SessionCountdown from '../../components/SessionCountdown'
import { getReminders, startReminderLoop, unseenCount } from '../../lib/reminders'
import { api } from '../../services/api'

export default function StudentLayout() {
  const nav = useNavigate()
  const [session, setSession] = useState<any>(null)
  const [unseen, setUnseen] = useState(0)
  function signOut() { clearAuthentication(); nav('/login', { replace: true }) }
  useEffect(() => {
    api.get('/student/attendance/active-session').then(r => setSession(r.data)).catch(() => {})
    const upd = () => setUnseen(unseenCount())
    upd()
    const stop = startReminderLoop()
    window.addEventListener('ccd-reminders', upd)
    window.addEventListener('storage', upd)
    // poll reminders via getReminders
    const id = window.setInterval(upd, 5000)
    return () => { stop(); window.removeEventListener('ccd-reminders', upd); window.clearInterval(id) }
  }, [])
  // also count API messages? simple local
  useEffect(() => {
    const id = window.setInterval(() => setUnseen(getReminders().length ? unseenCount() : 0), 5000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="app student-shell">
      <header className="student-header">
        <div className="student-brand-row">
          <div className="brand">CCD-<span>Attendance</span></div>
          <ThemeToggle />
        </div>
        <nav aria-label="Student">
          <NavLink to="/student/home">Home</NavLink>
          <NavLink to="/student/attendance">Attendance</NavLink>
          <NavLink to="/student/history">History</NavLink>
          <NavLink to="/student/face-enrollment">Face ID</NavLink>
          <NavLink to="/student/messages">Messages{unseen>0 && <span style={{ marginLeft:6, background:'var(--blue)', color:'white', borderRadius:999, padding:'1px 6px', fontSize:10 }}>{unseen}</span>}</NavLink>
          <NavLink to="/student/profile">Profile</NavLink>
          <button className="ghost" type="button" onClick={signOut}>Sign out</button>
        </nav>
      </header>
      {session && <div style={{ marginBottom:12 }}><SessionCountdown session={session} /></div>}
      <Outlet />
    </div>
  )
}
