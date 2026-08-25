import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clearAuthentication, type Role } from '../lib/auth'
import { portalNavigation } from '../lib/portal'

export default function PortalLayout({ role }: { role: Extract<Role, 'admin' | 'instructor'> }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const nav = portalNavigation(role)
  const active = nav.find(item => item.path === location.pathname)

  function signOut() {
    clearAuthentication()
    navigate('/login', { replace: true })
  }

  return <div className="portal-shell">
    <aside className={`portal-sidebar ${open ? 'is-open' : ''}`}>
      <div className="portal-brand"><div className="brand">Fika<span>AI</span></div><small>Attendance intelligence</small></div>
      <div className="role-chip"><i/>{role === 'admin' ? 'Administration' : 'Instructor portal'}</div>
      <nav className="portal-nav" aria-label={`${role} navigation`}>
        {nav.map(item => <NavLink key={item.path} to={item.path} onClick={() => setOpen(false)}><span>{item.mark}</span>{item.label}</NavLink>)}
      </nav>
      <div className="sidebar-account"><div className="avatar">{(localStorage.getItem('fikaai.name') || role).slice(0, 2).toUpperCase()}</div><div><b>{localStorage.getItem('fikaai.name') || role}</b><small>{role}</small></div><button onClick={signOut} title="Sign out" aria-label="Sign out">Exit</button></div>
    </aside>
    {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setOpen(false)}/>} 
    <section className="portal-main">
      <header className="portal-topbar"><button className="menu-button" onClick={() => setOpen(value => !value)} aria-label="Open navigation">Menu</button><div><span>Workspace</span><b>{active?.label || 'Portal'}</b></div><div className="topbar-status"><i/>Secure session</div></header>
      <Outlet/>
    </section>
  </div>
}
