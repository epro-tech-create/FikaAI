import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { DataTable, PageHeading, StatePanel } from '../../components/PortalUI'
import type { Role } from '../../lib/auth'

type Option = { id: string; title?: string; name?: string; fullName?: string; code?: string }
type Options = { courses: Option[]; instructors: Option[]; locations: Option[] }

const emptyForm = {
  title: '', courseId: '', instructorId: '', locationId: '', sessionDate: '', checkInOpen: '', officialStart: '', checkInClose: '', expectedEnd: '', checkOutClose: '', permittedRadiusMeters: '50', lateThresholdMinutes: '15',
}

function list(data: unknown) {
  if (Array.isArray(data)) return data as Record<string, unknown>[]
  if (!data || typeof data !== 'object') return []
  const source = data as Record<string, unknown>
  return (source.items || source.sessions || source.results || []) as Record<string, unknown>[]
}

export default function SessionPage({ role }: { role: Extract<Role, 'admin' | 'instructor'> }) {
  const [sessions, setSessions] = useState<Record<string, unknown>[]>([])
  const [options, setOptions] = useState<Options>({ courses: [], instructors: [], locations: [] })
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    setLoading(true); setError('')
    const optionRequest = role === 'admin'
      ? Promise.all([api.get('/admin/courses'), api.get('/admin/instructors'), api.get('/admin/locations')]).then(([courses, instructors, locations]) => ({ data: { courses: courses.data, instructors: instructors.data, locations: locations.data } }))
      : Promise.all([api.get('/instructor/courses'), api.get('/instructor/dashboard'), api.get('/instructor/locations').catch(() => ({ data: [] }))]).then(([courses, dashboard, locations]) => ({ data: { courses: courses.data, instructors: [{ id: dashboard.data.instructorId, fullName: dashboard.data.fullName }], locations: locations.data } }))
    Promise.all([
      api.get(`/${role}/sessions`),
      optionRequest,
    ]).then(([sessionResponse, optionResponse]) => {
      setSessions(list(sessionResponse.data))
      const data = optionResponse.data || {}
      setOptions({ courses: data.courses || [], instructors: data.instructors || [], locations: data.locations || [] })
      if (role === 'instructor' && data.instructors?.[0]?.id) setForm(current => ({ ...current, instructorId: data.instructors[0].id }))
    }).catch(requestError => setError(message(requestError))).finally(() => setLoading(false))
  }

  useEffect(load, [role])

  async function create(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      await api.post(`/${role}/sessions`, { ...form, permittedRadiusMeters: Number(form.permittedRadiusMeters), lateThresholdMinutes: Number(form.lateThresholdMinutes), instructorId: role === 'instructor' ? undefined : form.instructorId })
      setNotice('Attendance session created successfully.')
      setForm(emptyForm); setShowForm(false); load()
    } catch (requestError) { setError(message(requestError)) } finally { setSaving(false) }
  }

  const optionLabel = (option: Option) => option.title || option.name || option.fullName || option.code || option.id
  return <main className="portal-content"><PageHeading eyebrow="ATTENDANCE OPERATIONS" title="Attendance Sessions" description="Schedule, monitor, and review time-bound attendance activity." action={<button className="portal-primary" onClick={() => setShowForm(value => !value)}>{showForm ? 'Close form' : 'Create session'}</button>}/>
    {showForm && <form className="content-card session-form" onSubmit={create}><div className="form-heading"><div><p>NEW SESSION</p><h2>Session details</h2></div><span>All fields are required</span></div><div className="form-grid">
      <label className="wide">Session title<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Morning practical attendance"/></label>
      <label>Course<select required value={form.courseId} onChange={event => setForm({ ...form, courseId: event.target.value })}><option value="">Select course</option>{options.courses.map(option => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}</select></label>
      <label>Instructor<select required value={form.instructorId} onChange={event => setForm({ ...form, instructorId: event.target.value })}><option value="">Select instructor</option>{options.instructors.map(option => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}</select></label>
      <label>Location<select required value={form.locationId} onChange={event => setForm({ ...form, locationId: event.target.value })}><option value="">Select location</option>{options.locations.map(option => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}</select></label>
      <label>Date<input required type="date" value={form.sessionDate} onChange={event => setForm({ ...form, sessionDate: event.target.value })}/></label>
      {[['checkInOpen', 'Check-in opens'], ['officialStart', 'Official start'], ['checkInClose', 'Check-in closes'], ['expectedEnd', 'Expected end'], ['checkOutClose', 'Check-out closes']].map(([key, label]) => <label key={key}>{label}<input required type="time" value={form[key as keyof typeof form]} onChange={event => setForm({ ...form, [key]: event.target.value })}/></label>)}
      <label>Permitted radius (metres)<input required min="1" type="number" value={form.permittedRadiusMeters} onChange={event => setForm({ ...form, permittedRadiusMeters: event.target.value })}/></label>
      <label>Late threshold (minutes)<input required min="0" type="number" value={form.lateThresholdMinutes} onChange={event => setForm({ ...form, lateThresholdMinutes: event.target.value })}/></label>
    </div><div className="form-actions"><button type="button" onClick={() => setShowForm(false)}>Cancel</button><button className="portal-primary" disabled={saving}>{saving ? 'Creating...' : 'Create session'}</button></div></form>}
    {notice && <div className="success">{notice}</div>}{error && !loading && <StatePanel kind="error">{error}</StatePanel>}
    <section className="content-card"><div className="card-toolbar"><div><b>Session schedule</b><span>{sessions.length} records</span></div><button onClick={load}>Refresh</button></div>{loading ? <StatePanel kind="loading"/> : sessions.length ? <DataTable columns={[{ key: 'title', label: 'Session' }, { key: 'courseTitle', label: 'Course' }, { key: 'locationName', label: 'Location' }, { key: 'sessionDate', label: 'Date' }, { key: 'officialStart', label: 'Starts' }, { key: 'status', label: 'Status' }]} items={sessions}/> : !error && <StatePanel kind="empty">Create the first attendance session to begin.</StatePanel>}</section>
  </main>
}
