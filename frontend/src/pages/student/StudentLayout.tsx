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
          <NavLink to="/student/courses" onClick={() => setMenuOpen(false)}>Courses</NavLink>
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
      <nav className="student-bottom-nav" aria-label="Student navigation">
        <NavLink to="/student/home" className={({isActive})=> isActive? 'active':''} aria-label="Home">
          <span className="bn-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 10.2L12 4l7 6.2V20a1 1 0 0 1-1 1h-3.5v-6H9.5V21H6a1 1 0 0 1-1-1V10.2z"/><path d="M9.5 15H14.5" opacity="0"/></svg>
          </span>
          <small>Home</small>
        </NavLink>
        <NavLink to="/student/courses" className={({isActive})=> isActive? 'active':''} aria-label="Courses">
          <span className="bn-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5.8H12L16 9v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.8a1 1 0 0 1 1-1z"/><path d="M12 5.8v3.2H16"/><path d="M7 13h8M7 16h5"/></svg>
          </span>
          <small>Courses</small>
        </NavLink>
        <NavLink to="/student/attendance" className={({isActive})=> isActive? 'bn-center active':'bn-center'} aria-label="Attendance">
          <span className="bn-center-fab">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4.2" width="16" height="15.5" rx="3"/><path d="M8 2.5v3.5M16 2.5v3.5M4 8.5h16"/><path d="M8.5 13l2 2 4.5-4.5" strokeWidth="2"/><circle cx="18.2" cy="6.2" r="1" fill="white" stroke="none"/></svg>
          </span>
          <small className="bn-center-label">Attendance</small>
        </NavLink>
        <NavLink to="/student/messages" className={({isActive})=> isActive? 'active':''} aria-label="Messages">
          <span className="bn-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.2" y="5.5" width="17.6" height="12.8" rx="2.2"/><path d="M3.6 6.4l8.4 7 8.4-7"/><path d="M8.2 11.5l-5 5M15.8 11.5l5 5" opacity="0.0"/></svg>
            {unseen>0 && <i className="bn-dot">{unseen>9?'9+':unseen}</i>}
          </span>
          <small>Messages</small>
        </NavLink>
        <NavLink to="/student/profile" className={({isActive})=> isActive? 'active':''} aria-label="Profile">
          <span className="bn-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.6" r="3.7"/><path d="M4.8 19.2a7.2 7.2 0 0 1 14.4 0" /><path d="M12 12.3v2.2" opacity="0"/></svg>
          </span>
          <small>Profile</small>
        </NavLink>
      </nav>
    </div>
  )
}
