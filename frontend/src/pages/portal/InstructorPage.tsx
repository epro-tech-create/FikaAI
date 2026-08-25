import { useEffect, useState } from 'react'
import { DataTable, PageHeading, StatePanel } from '../../components/PortalUI'
import { api, message } from '../../services/api'

type Instructor = Record<string, unknown>

const emptyForm = { fullName: '', email: '', password: '', confirmPassword: '' }

export function instructorFormError(form: typeof emptyForm) {
  if (form.password !== form.confirmPassword) return 'Passwords do not match.'
  if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) {
    return 'Use at least 8 characters with uppercase, lowercase, and a number.'
  }
  return ''
}

export default function InstructorPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function load() {
    setLoading(true)
    setError('')
    api.get('/admin/instructors')
      .then(response => setInstructors(Array.isArray(response.data) ? response.data : []))
      .catch(requestError => setError(message(requestError)))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    const validationError = instructorFormError(form)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await api.post('/admin/instructors', {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
      })
      setInstructors(current => [response.data, ...current])
      setNotice(`${form.fullName.trim()} can now sign in through the Instructor Portal.`)
      setForm(emptyForm)
      setShowForm(false)
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setSaving(false)
    }
  }

  return <main className="portal-content">
    <PageHeading eyebrow="ACCESS MANAGEMENT" title="Instructors" description="Register instructor accounts and review access to the teaching portal." action={<button className="portal-primary" onClick={() => { setShowForm(value => !value); setError(''); setNotice('') }}>{showForm ? 'Close form' : 'Register instructor'}</button>}/>
    {showForm && <form className="content-card session-form" onSubmit={create}>
      <div className="form-heading"><div><p>NEW INSTRUCTOR</p><h2>Instructor account</h2></div><span>Administrator approval required</span></div>
      <div className="form-grid">
        <label className="wide">Full name<input required minLength={3} autoComplete="name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} placeholder="Amina Mushi"/></label>
        <label className="wide">Email address<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="instructor@example.com"/></label>
        <label className="wide">Initial password<input required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
        <label className="wide">Confirm password<input required minLength={8} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })}/></label>
      </div>
      <p className="password-hint">Use at least 8 characters with uppercase, lowercase, and a number. Share it with the instructor securely.</p>
      <div className="form-actions"><button type="button" onClick={() => { setShowForm(false); setForm(emptyForm); setError('') }}>Cancel</button><button className="portal-primary" disabled={saving}>{saving ? 'Registering...' : 'Register instructor'}</button></div>
    </form>}
    {notice && <div className="success">{notice}</div>}
    {error && !loading && <StatePanel kind="error">{error}</StatePanel>}
    <section className="content-card"><div className="card-toolbar"><div><b>Instructor directory</b><span>{instructors.length} records</span></div><button onClick={load}>Refresh</button></div>
      {loading ? <StatePanel kind="loading"/> : instructors.length ? <DataTable columns={[{ key: 'fullName', label: 'Instructor' }, { key: 'email', label: 'Email' }, { key: 'isActive', label: 'Status' }, { key: 'createdAt', label: 'Created' }]} items={instructors}/> : !error && <StatePanel kind="empty">Register the first instructor account to begin.</StatePanel>}
    </section>
  </main>
}
