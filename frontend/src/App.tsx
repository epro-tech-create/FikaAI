import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, message } from './services/api'
import AttendancePage from './pages/student/AttendancePage'
import AutoCheckInPage from './pages/student/AutoCheckInPage'
import FaceEnrollmentPage from './pages/student/FaceEnrollmentPage'
import LandingPage from './pages/LandingPage'
import PortalLayout from './components/PortalLayout'
import DashboardPage from './pages/portal/DashboardPage'
import DataPage from './pages/portal/DataPage'
import InfoPage from './pages/portal/InfoPage'
import InstructorPage from './pages/portal/InstructorPage'
import StudentPage from './pages/portal/StudentPage'
import CoursePage from './pages/portal/CoursePage'
import ReportsPage from './pages/portal/ReportsPage'
import VenueQrPage from './pages/portal/VenueQrPage'
import StudentLayout from './pages/student/StudentLayout'
import { adminPages, instructorPages } from './pages/portal/config'
import { clearAuthentication, getStoredRole, parseRole, storeAuthentication } from './lib/auth'
import { applicationConfig, currentApplication, instructorLoginUrl, portalTitleForRole, type Application } from './lib/application'
import { getRegistrationDeviceId } from './lib/device'
import { startInactivityTimer } from './lib/inactivity'
import { applySeo, seoForApplication } from './lib/seo'
import { trackPageView } from './lib/analytics'

const VENUE_CODE_KEY = 'ccd.venueCode'

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

function Login({ application }: { application: Application }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const config = applicationConfig(application)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const code = (params.get('code') || '').trim().toUpperCase()
    if (/^[A-Z0-9]{8}$/.test(code)) sessionStorage.setItem(VENUE_CODE_KEY, code)
  }, [params])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api.post('/auth/login', { email, password })
      const role = parseRole(response.data?.role)
      if (role && role !== config.role) {
        setError(`This account belongs to the ${portalTitleForRole(role)}. Open that application to sign in.`)
        return
      }
      storeAuthentication(response.data)
      const next = safeNextPath(params.get('next')) || config.home
      navigate(next)
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setBusy(false)
    }
  }

  return <main className="center"><form className="panel login" onSubmit={submit}><div className="brand">CCD-<span>Attendance</span></div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}</h1><label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="username" required/></label><label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="current-password" autoFocus required/></label>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button><small>Enter your password whenever the app is opened or refreshed.</small>{application === 'student' && <p className="auth-switch">New student? <Link to="/signup">Create an account</Link></p>}</form></main>
}

function CheckInEntry() {
  const [params] = useSearchParams()
  const code = (params.get('code') || '').trim().toUpperCase()
  if (/^[A-Z0-9]{8}$/.test(code)) sessionStorage.setItem(VENUE_CODE_KEY, code)
  const dest = code ? `/student/checkin?code=${encodeURIComponent(code)}` : '/student/checkin'
  const signedIn = Boolean(localStorage.getItem('ccd.access') || localStorage.getItem('fikaai.access'))
  if (!signedIn || getStoredRole() !== 'student') {
    const next = encodeURIComponent(dest)
    const login = code ? `/login?next=${next}&code=${encodeURIComponent(code)}` : `/login?next=${next}`
    return <Navigate to={login} replace />
  }
  return <Navigate to={dest} replace />
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
        deviceId:getRegistrationDeviceId(),
        password,
      })
      storeAuthentication(response.data)
      navigate('/student/face-enrollment')
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setBusy(false)
    }
  }

  return <main className="center"><form className="panel login signup" onSubmit={submit}><div className="brand">CCD-<span>Attendance</span></div><p className="eyebrow">NEW STUDENT REGISTRATION</p><h1>Create your account</h1><p className="signup-intro">Register for cybersecurity practical attendance. You will enrol your face on the next step.</p><label>Full name<input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" placeholder="Amina Mushi" required/></label><label>Email address<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="student@example.com" required/></label><label>Registration number<input value={registrationNumber} onChange={event => setRegistrationNumber(event.target.value.replace(/\D/g,'').slice(0,50))} inputMode="numeric" pattern="[0-9]{3,50}" minLength={3} maxLength={50} placeholder="e.g. 2402424123456" required/></label><div className="signup-passwords"><label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required/></label><label>Confirm password<input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required/></label></div><p className="password-hint">Use at least 8 characters with uppercase, lowercase and a number.</p>{error && <div className="error">{error}</div>}<button disabled={busy}>{busy ? 'Creating account…' : 'Create student account'}</button><p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p></form></main>
}

function hasAccess() { return Boolean(localStorage.getItem('ccd.access') || localStorage.getItem('fikaai.access')) }
function Guard({ application, children }: { application: Application; children: React.ReactNode }) {
  if (!hasAccess()) return <Navigate to="/login" replace/>
  if (getStoredRole() !== applicationConfig(application).role) {
    clearAuthentication()
    return <Navigate to="/login" replace/>
  }
  return <>{children}</>
}

function HomeRedirect({ application }: { application: Application }) {
  const config = applicationConfig(application)
  const signedInRole = getStoredRole()
  const validSession = hasAccess() && signedInRole === config.role
  return <Navigate to={validSession ? config.home : '/login'} replace/>
}

export default function App({ application }: { application?: Application }) {
  const app = application ?? currentApplication()
  const location = useLocation()
  useEffect(() => {
    applySeo(seoForApplication(app))
  }, [app])
  // Per-route SEO + Google Analytics page_view for attendance.cyberclubdit.org
  useEffect(() => {
    const path = location.pathname
    if (app === 'student') {
      if (path === '/') applySeo({ title: 'CCD-Attendance — Secure Student Attendance System with Face ID & GPS Geofence | DIT Tanzania', description: 'The trusted student attendance system for DIT & universities in Tanzania. GPS geofence + live Face ID verification — fast, private & fraud-proof. Mark attendance in seconds.', canonical: 'https://attendance.cyberclubdit.org/' })
      else if (path === '/login') applySeo({ title: 'Student Attendance Login — CCD-Attendance | Sign in to Mark Attendance', description: 'Sign in to CCD-Attendance to mark your student attendance with Face ID and GPS verification. Secure attendance for DIT practical training.', canonical: 'https://attendance.cyberclubdit.org/login' })
      else if (path === '/signup') applySeo({ title: 'Create Attendance Account — CCD-Attendance | Student Registration', description: 'Create your CCD-Attendance student account to start marking attendance with secure Face ID and GPS geofence verification.', canonical: 'https://attendance.cyberclubdit.org/signup' })
      else applySeo({ noindex: true })
    }
    // Google SEO: SPA page_view (GA4)
    trackPageView(path)
  }, [app, location.pathname])
  useEffect(() => {
    if (!hasAccess()) return
    return startInactivityTimer(() => {
      clearAuthentication()
      window.location.replace('/login')
    })
  }, [location.pathname])
  return <Routes>
    <Route path="/login" element={<Login application={app}/>}/>
    {app === 'student' && <>
      <Route path="/" element={<LandingPage instructorLoginUrl={instructorLoginUrl()}/>}/>
      <Route path="/signup" element={<Signup/>}/>
      <Route path="/checkin" element={<CheckInEntry/>}/>
      <Route path="/student" element={<Guard application={app}><StudentLayout/></Guard>}>
        <Route index element={<Navigate to="attendance" replace/>}/>
        <Route path="attendance" element={<AttendancePage/>}/>
        <Route path="checkin" element={<AutoCheckInPage/>}/>
        <Route path="face-enrollment" element={<FaceEnrollmentPage/>}/>
      </Route>
    </>}
    {app === 'admin' && (
      <Route path="/admin" element={<Guard application={app}><PortalLayout role="admin"/></Guard>}>
        <Route index element={<Navigate to="dashboard" replace/>}/>
        <Route path="dashboard" element={<DashboardPage role="admin"/>}/>
        <Route path="venue-qr" element={<VenueQrPage role="admin"/>}/>
        <Route path="students" element={<StudentPage/>}/>
        <Route path="instructors" element={<InstructorPage/>}/>
        <Route path="courses" element={<CoursePage/>}/>
        <Route path="reports" element={<ReportsPage/>}/>
        {Object.entries(adminPages).map(([path, config]) => <Route key={path} path={path} element={<DataPage config={config}/>}/>)}
        <Route path="system-settings" element={<InfoPage title="System Settings"/>}/>
        <Route path="profile" element={<InfoPage title="Profile"/>}/>
      </Route>
    )}
    {app === 'instructor' && (
      <Route path="/instructor" element={<Guard application={app}><PortalLayout role="instructor"/></Guard>}>
        <Route index element={<Navigate to="dashboard" replace/>}/>
        <Route path="dashboard" element={<DashboardPage role="instructor"/>}/>
        <Route path="venue-qr" element={<VenueQrPage role="instructor"/>}/>
        {Object.entries(instructorPages).map(([path, config]) => <Route key={path} path={path} element={<DataPage config={config}/>}/>)}
        <Route path="notifications" element={<InfoPage title="Notifications"/>}/>
        <Route path="profile" element={<InfoPage title="Profile"/>}/>
      </Route>
    )}
    <Route path="*" element={<HomeRedirect application={app}/>}/>
  </Routes>
}
