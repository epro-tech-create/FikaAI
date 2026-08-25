import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { PageHeading, StatCard, StatePanel } from '../../components/PortalUI'
import type { Role } from '../../lib/auth'

export default function DashboardPage({ role }: { role: Extract<Role, 'admin' | 'instructor'> }) {
  const [data, setData] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => { api.get(`/${role}/dashboard`).then(response => setData(response.data || {})).catch(requestError => setError(message(requestError))).finally(() => setLoading(false)) }, [role])
  const admin = role === 'admin'
  const stats = admin ? [
    ['Total students', data.totalStudents ?? data.students, 'Registered learners'], ['Active instructors', data.activeInstructors ?? data.instructors, 'Enabled accounts'], ['Active courses', data.activeCourses ?? data.courses, 'Current catalogue'], ['Sessions today', data.sessionsToday ?? data.sessions, 'Scheduled and active'],
  ] : [
    ['My courses', data.myCourses ?? data.assignedCourses ?? data.courses, 'Assigned courses'], ['Sessions today', data.sessionsToday ?? data.sessions, 'Your schedule'], ['Attendance records', data.attendanceRecords ?? data.present, 'Verified outcomes'], ['Attendance rate', data.attendanceRate ? `${data.attendanceRate}%` : '0%', 'Current reporting period'],
  ]
  return <main className="portal-content"><PageHeading eyebrow={admin ? 'SYSTEM OVERVIEW' : 'TEACHING OVERVIEW'} title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${(localStorage.getItem('fikaai.name') || role).split(' ')[0]}`} description="Live operational signals for attendance and identity verification."/>
    {loading ? <StatePanel kind="loading"/> : <><div className="stat-grid">{stats.map((stat, index) => <StatCard key={stat[0] as string} label={stat[0] as string} value={stat[1]} note={stat[2] as string} tone={index === 0 ? 'accent' : ''}/>)}</div>{error && <StatePanel kind="error">{error}</StatePanel>}<div className="dashboard-grid"><section className="content-card insight-card"><p>ATTENDANCE PULSE</p><h2>{admin ? 'System readiness' : 'Today at a glance'}</h2><div className="pulse-visual"><i/><i/><i/><i/><i/><i/><i/></div><span>Connect the dashboard endpoint to surface live attendance trends here.</span></section><section className="content-card quick-card"><p>QUICK CHECK</p><h2>Operational status</h2><ul><li><i/>Identity verification service <b>Monitored</b></li><li><i/>Attendance records <b>Protected</b></li><li><i/>Role permissions <b>Enforced</b></li></ul></section></div></>}
  </main>
}
