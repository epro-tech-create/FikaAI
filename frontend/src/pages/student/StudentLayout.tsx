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
  const [menuOpen, setMenuOpen] = useState(false)
  function signOut() { clearAuthentication(); nav('/login', { replace: true }) }
  useEffect(() => {
    api.get('/student/attendance/active-session').then(r => setSession(r.data)).catch(() => {})
    const upd = () => setUnseen(unseenCount())
    upd()
    const stop = startReminderLoop()
    window.addEventListener('ccd-reminders', upd)
    window.addEventListener('storage', upd)
    const id = window.setInterval(upd, 5000)
    return () => { stop(); window.removeEventListener('ccd-reminders', upd); window.clearInterval(id) }
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => setUnseen(getReminders().length ? unseenCount() : 0), 5000)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    if (menuOpen) document.body.classList.add('portal-menu-open')
    else document.body.classList.remove('portal-menu-open')
    return () => document.body.classList.remove('portal-menu-open')
  }, [menuOpen])
  return (
    <div className="app student-shell">
      <header className="student-header">
        <div className="student-brand-row">
          <div className="brand">CCD-<span>Attendance</span></div>
          <ThemeToggle />
        </div>
        <button className="student-menu-btn" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)}>
          <span className="hamburger"><i/><i/><i/></span>
          {menuOpen ? 'Close' : 'Menu'}
        </button>
        <nav aria-label="Student" className={menuOpen ? 'is-open' : ''}>
          <NavLink to="/student/home" onClick={() => setMenuOpen(false)}>Home</NavLink>
          <NavLink to="/student/attendance" onClick={() => setMenuOpen(false)}>Attendance</NavLink>
          <NavLink to="/student/history" onClick={() => setMenuOpen(false)}>History</NavLink>
          <NavLink to="/student/face-enrollment" onClick={() => setMenuOpen(false)}>Face ID</NavLink>
          <NavLink to="/student/messages" onClick={() => setMenuOpen(false)}>Messages{unseen>0 && <span className="nav-badge">{unseen}</span>}</NavLink>
          <NavLink to="/student/profile" onClick={() => setMenuOpen(false)}>Profile</NavLink>
          <button className="ghost nav-signout" type="button" onClick={signOut}>Sign out</button>
        </nav>
      </header>
      {menuOpen && <button className="student-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      {session && <div className="student-session-bar"><SessionCountdown session={session} /></div>}
      <div className="student-content">
        <Outlet />
      </div>
    </div>
  )
}
