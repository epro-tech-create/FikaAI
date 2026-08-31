import { Outlet, useNavigate } from 'react-router-dom'
import { clearAuthentication } from '../../lib/auth'
import ThemeToggle from '../../components/ThemeToggle'

export default function StudentLayout() {
  const nav = useNavigate()
  function signOut() { clearAuthentication(); nav('/login', { replace: true }) }
  return (
    <div className="app student-shell">
      <header className="student-header">
        <div className="brand">CCD-<span>Attendance</span></div>
        <nav>
          <ThemeToggle />
          <button className="ghost" type="button" onClick={signOut}>Sign out</button>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
