import { useEffect, useState, type FormEvent } from 'react'
import { CardToolbar, DataTable, PageHeading, StatePanel } from '../../components/PortalUI'
import { matchesSearch } from '../../lib/tableSearch'
import { api, message } from '../../services/api'

type Instructor = Record<string, unknown> & { id: string; fullName: string; email: string; isActive: boolean }
type InstructorForm = { fullName: string; email: string; isActive: boolean; password: string; confirmPassword: string }

const emptyForm: InstructorForm = { fullName: '', email: '', isActive: true, password: '', confirmPassword: '' }

export function instructorFormError<T extends { password: string; confirmPassword: string }>(form: T, isEditing = false) {
  if (isEditing && !form.password && !form.confirmPassword) return ''
  if (form.password !== form.confirmPassword) return 'Passwords do not match.'
  if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) {
    return 'Use at least 8 characters with uppercase, lowercase, and a number.'
  }
  return ''
}

export default function InstructorPage() {
  const [instructors, setInstructors] = useState<Instructor[]>([])
  const [form, setForm] = useState<InstructorForm>(emptyForm)
  const [editing, setEditing] = useState<Instructor | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  function load() {
    setLoading(true)
    setError('')
    return api.get('/admin/instructors')
      .then(response => setInstructors(Array.isArray(response.data) ? response.data : []))
      .catch(requestError => setError(message(requestError)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { void load() }, [])

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(emptyForm)
    setError('')
  }

  function startEdit(instructor: Instructor) {
    setEditing(instructor)
    setForm({ fullName: instructor.fullName, email: instructor.email, isActive: instructor.isActive, password: '', confirmPassword: '' })
    setShowForm(true)
    setError('')
    setNotice('')
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const validationError = instructorFormError(form, Boolean(editing))
    if (validationError) {
      setError(validationError)
      return
    }
    const payload: Record<string, unknown> = { fullName: form.fullName.trim(), email: form.email.trim() }
    if (editing) payload.isActive = form.isActive
    if (form.password) payload.password = form.password
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (editing) await api.patch(`/admin/instructors/${editing.id}`, payload)
      else await api.post('/admin/instructors', { ...payload, password: form.password })
      const name = form.fullName.trim()
      const wasEditing = Boolean(editing)
      closeForm()
      setNotice(`${name} was ${wasEditing ? 'updated' : 'registered'} successfully.`)
      await load()
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setSaving(false)
    }
  }

  async function remove(instructor: Instructor) {
    if (!window.confirm(`Delete ${instructor.fullName} permanently? This cannot be undone.`)) return
    setDeletingId(instructor.id)
    setError('')
    setNotice('')
    try {
      await api.delete(`/admin/instructors/${instructor.id}`)
      setInstructors(current => current.filter(item => item.id !== instructor.id))
      setNotice(`${instructor.fullName} was permanently deleted.`)
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setDeletingId('')
    }
  }

  function applySearch(event?: FormEvent) {
    event?.preventDefault()
    setSearchQuery(searchInput)
  }

  const visibleInstructors = instructors.filter(instructor => matchesSearch(instructor, searchQuery, ['fullName', 'email']))

  return <main className="portal-content">
    <PageHeading eyebrow="ACCESS MANAGEMENT" title="Instructors" description="Register instructor accounts and manage access to the teaching portal." action={<button className="portal-primary" onClick={() => { if (showForm) closeForm(); else { setShowForm(true); setEditing(null); setForm(emptyForm); setError(''); setNotice('') } }}>{showForm ? 'Close form' : 'Register instructor'}</button>}/>
    {showForm && <form className="content-card session-form" onSubmit={save}>
      <div className="form-heading"><div><p>{editing ? 'EDIT INSTRUCTOR' : 'NEW INSTRUCTOR'}</p><h2>{editing ? 'Update instructor account' : 'Instructor account'}</h2></div><span>{editing ? 'Password change optional' : 'Administrator approval required'}</span></div>
      <div className="form-grid">
        <label className="wide">Full name<input required minLength={3} autoComplete="name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} placeholder="Amina Mushi"/></label>
        <label className="wide">Email address<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="instructor@example.com"/></label>
        {editing && <label className="checkbox-control wide"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })}/><span><b>Active account</b><small>Instructor can sign in</small></span></label>}
        <label className="wide">{editing ? 'Replacement password (optional)' : 'Initial password'}<input required={!editing} minLength={form.password ? 8 : undefined} type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
        <label className="wide">Confirm password<input required={!editing || Boolean(form.password)} minLength={form.confirmPassword ? 8 : undefined} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })}/></label>
      </div>
      <p className="password-hint">Use at least 8 characters with uppercase, lowercase, and a number. Share new passwords securely.</p>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={closeForm}>Cancel</button><button className="portal-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Register instructor'}</button></div>
    </form>}
    {notice && <div className="success">{notice}</div>}
    {error && !loading && <StatePanel kind="error">{error}</StatePanel>}
    <section className="content-card">
      <CardToolbar
        title="Instructor directory"
        meta={searchQuery ? `${visibleInstructors.length} of ${instructors.length} records` : `${instructors.length} records`}
        search={{ value: searchInput, onChange: setSearchInput, onSubmit: () => applySearch(), placeholder: 'Name or email…', label: 'Search instructors' }}
        onRefresh={() => void load()}
      />
      {loading ? <StatePanel kind="loading"/> : visibleInstructors.length ? <DataTable columns={[{ key: 'fullName', label: 'Instructor' }, { key: 'email', label: 'Email' }, { key: 'isActive', label: 'Status' }, { key: 'createdAt', label: 'Created' }]} items={visibleInstructors} renderActions={item => { const instructor = item as Instructor; return <><button onClick={() => startEdit(instructor)}>Edit</button><button className="danger-button" disabled={deletingId === instructor.id} onClick={() => void remove(instructor)}>{deletingId === instructor.id ? 'Deleting...' : 'Delete'}</button></> }}/> : !error && <StatePanel kind="empty">{instructors.length ? 'No instructors match this search.' : 'Register the first instructor account to begin.'}</StatePanel>}
    </section>
  </main>
}
