import { useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, message } from './services/api'
import AttendancePage from './pages/student/AttendancePage'
import FaceEnrollmentPage from './pages/student/FaceEnrollmentPage'
import PortalLayout from './components/PortalLayout'
import DashboardPage from './pages/portal/DashboardPage'
import DataPage from './pages/portal/DataPage'
import InfoPage from './pages/portal/InfoPage'
import SessionPage from './pages/portal/SessionPage'
import { adminPages, instructorPages } from './pages/portal/config'
import { getStoredRole, roleHome, storeAuthentication, type Role } from './lib/auth'

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('student01@fikaai.dev')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api.post('/auth/login', { email, password })
      const role = storeAuthentication(response.data)
      navigate(roleHome(role))
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setBusy(false)
    }
  }

  return <main className="center"><form className="panel login" onSubmit={submit}><div className="brand">Fika<span>AI</span></div><p className="eyebrow">FIELD PRACTICAL ATTENDANCE</p><h1>Sign in to continue</h1><label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="username" required/></label><label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" autoFocus required/></label>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><small>Enter your password whenever the app is opened or refreshed.</small><p className="auth-switch">New student? <Link to="/signup">Create an account</Link></p></form></main>
}

function Signup() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await api.post('/auth/register', {
        fullName,
        email,
        registrationNumber,
        password,
      })
      const role = storeAuthentication(response.data)
      navigate(role === 'student' ? '/student/face-enrollment' : roleHome(role))
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setBusy(false)
    }
  }

  return <main className="center"><form className="panel login signup" onSubmit={submit}><div className="brand">Fika<span>AI</span></div><p className="eyebrow">NEW STUDENT REGISTRATION</p><h1>Create your account</h1><p className="signup-intro">Register for cybersecurity practical attendance. You will enrol your face on the next step.</p><label>Full name<input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" placeholder="Amina Mushi" required/></label><label>Email address<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="student@example.com" required/></label><label>Registration number<input value={registrationNumber} onChange={event => setRegistrationNumber(event.target.value)} autoCapitalize="characters" placeholder="REG-2026-031" required/></label><div className="signup-passwords"><label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required/></label><label>Confirm password<input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required/></label></div><p className="password-hint">Use at least 8 characters with uppercase, lowercase and a number.</p>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? 'Creating account…' : 'Create student account'}</button><p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p></form></main>
}

function Guard({ role, children }: { role: Role; children: React.ReactNode }) {
  if (!localStorage.getItem('fikaai.access')) return <Navigate to="/login" replace/>
  const signedInRole = getStoredRole()
  return signedInRole === role ? <>{children}</> : <Navigate to={roleHome(signedInRole)} replace/>
}

function HomeRedirect() {
  return <Navigate to={localStorage.getItem('fikaai.access') ? roleHome(getStoredRole()) : '/login'} replace/>
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login/>}/>
    <Route path="/signup" element={<Signup/>}/>
    <Route path="/student/attendance" element={<Guard role="student"><AttendancePage/></Guard>}/>
    <Route path="/student/face-enrollment" element={<Guard role="student"><FaceEnrollmentPage/></Guard>}/>
    <Route path="/admin" element={<Guard role="admin"><PortalLayout role="admin"/></Guard>}>
      <Route index element={<Navigate to="dashboard" replace/>}/>
      <Route path="dashboard" element={<DashboardPage role="admin"/>}/>
      <Route path="attendance-sessions" element={<SessionPage role="admin"/>}/>
      {Object.entries(adminPages).map(([path, config]) => <Route key={path} path={path} element={<DataPage config={config}/>}/>)}
      <Route path="system-settings" element={<InfoPage title="System Settings"/>}/>
      <Route path="profile" element={<InfoPage title="Profile"/>}/>
    </Route>
    <Route path="/instructor" element={<Guard role="instructor"><PortalLayout role="instructor"/></Guard>}>
      <Route index element={<Navigate to="dashboard" replace/>}/>
      <Route path="dashboard" element={<DashboardPage role="instructor"/>}/>
      <Route path="attendance-sessions" element={<SessionPage role="instructor"/>}/>
      {Object.entries(instructorPages).map(([path, config]) => <Route key={path} path={path} element={<DataPage config={config}/>}/>)}
      <Route path="notifications" element={<InfoPage title="Notifications"/>}/>
      <Route path="profile" element={<InfoPage title="Profile"/>}/>
    </Route>
    <Route path="*" element={<HomeRedirect/>}/>
  </Routes>
}
