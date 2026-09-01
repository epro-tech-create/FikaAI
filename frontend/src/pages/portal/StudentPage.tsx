import { useEffect, useState, type FormEvent } from 'react'
import { CardToolbar, DataTable, PageHeading, StatePanel } from '../../components/PortalUI'
import { matchesSearch } from '../../lib/tableSearch'
import { membershipIdError, normalizeMembershipIdInput } from '../../lib/studentId'
import { api, message } from '../../services/api'

type Student = Record<string, unknown> & {
  id: string
  fullName: string
  email: string
  membershipId?: string | null
  registrationNumber: string
  courseOfStudy?: string | null
  yearOfStudy?: number | null
  isActive: boolean
}

type StudentForm = {
  fullName: string
  email: string
  membershipId: string
  registrationNumber: string
  courseOfStudy: string
  yearOfStudy: string
  isActive: boolean
  password: string
  confirmPassword: string
}

const emptyForm: StudentForm = { fullName: '', email: '', membershipId: '', registrationNumber: '', courseOfStudy: '', yearOfStudy: '', isActive: true, password: '', confirmPassword: '' }

export function studentFormError(form: StudentForm, isEditing = false) {
  if (!/^\d{3,50}$/.test(form.registrationNumber)) return 'Registration number must contain only digits.'
  const studentIdError = membershipIdError(form.membershipId)
  if (studentIdError) return studentIdError
  if (form.yearOfStudy && (!/^\d+$/.test(form.yearOfStudy) || Number(form.yearOfStudy) < 1 || Number(form.yearOfStudy) > 20)) return 'Year of study must be between 1 and 20.'
  if (!isEditing || form.password || form.confirmPassword) {
    if (form.password !== form.confirmPassword) return 'Passwords do not match.'
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password)) return 'Use at least 8 characters with uppercase, lowercase, and a number.'
  }
  return ''
}

function formFrom(student: Student): StudentForm {
  return {
    fullName: student.fullName,
    email: student.email,
    membershipId: student.membershipId || '',
    registrationNumber: student.registrationNumber,
    courseOfStudy: student.courseOfStudy || '',
    yearOfStudy: student.yearOfStudy ? String(student.yearOfStudy) : '',
    isActive: student.isActive,
    password: '',
    confirmPassword: '',
  }
}

export default function StudentPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [form, setForm] = useState<StudentForm>(emptyForm)
  const [editing, setEditing] = useState<Student | null>(null)
  const [viewing, setViewing] = useState<Student | null>(null)
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
    return api.get('/admin/students')
      .then(response => setStudents(Array.isArray(response.data) ? response.data : []))
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

  function startEdit(student: Student) {
    setEditing(student)
    setViewing(null)
    setForm(formFrom(student))
    setShowForm(true)
    setError('')
    setNotice('')
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const validationError = studentFormError(form, Boolean(editing))
    if (validationError) {
      setError(validationError)
      return
    }
    const payload: Record<string, unknown> = {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      membershipId: form.membershipId.trim() || null,
      registrationNumber: form.registrationNumber,
      courseOfStudy: form.courseOfStudy.trim() || null,
      yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null,
      isActive: form.isActive,
    }
    if (form.password) payload.password = form.password
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (editing) await api.patch(`/admin/students/${editing.id}`, payload)
      else await api.post('/admin/students', { ...payload, password: form.password })
      const name = form.fullName.trim()
      closeForm()
      setNotice(`${name} was ${editing ? 'updated' : 'added'} successfully.`)
      await load()
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setSaving(false)
    }
  }

  async function remove(student: Student) {
    if (!window.confirm(`Permanently delete ${student.fullName}? This cannot be undone.`)) return
    setDeletingId(student.id)
    setError('')
    setNotice('')
    try {
      await api.delete(`/admin/students/${student.id}`)
      setStudents(current => current.filter(item => item.id !== student.id))
      if (viewing?.id === student.id) setViewing(null)
      setNotice(`${student.fullName} was permanently deleted.`)
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

  const visibleStudents = students.filter(student => matchesSearch(student, searchQuery, ['fullName', 'membershipId', 'registrationNumber', 'email', 'courseOfStudy']))

  return <main className="portal-content">
    <PageHeading eyebrow="STUDENT MANAGEMENT" title="Students" description="Manage student identity, registration details, and account access." action={<button className="portal-primary" onClick={() => { if (showForm) closeForm(); else { setShowForm(true); setEditing(null); setForm(emptyForm); setError(''); setNotice('') } }}>{showForm ? 'Close form' : 'Add student'}</button>}/>
    {showForm && <form className="content-card session-form" onSubmit={save}>
      <div className="form-heading"><div><p>{editing ? 'EDIT STUDENT' : 'NEW STUDENT'}</p><h2>{editing ? 'Update student account' : 'Student account'}</h2></div><span>{editing ? 'Password change optional' : 'All required fields marked'}</span></div>
      <div className="form-grid">
        <label className="wide">Full name<input required minLength={3} autoComplete="name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })}/></label>
        <label className="wide">Email address<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
        <label>Student ID <small>(CCD membership)</small><input value={form.membershipId} onChange={event => setForm({ ...form, membershipId: normalizeMembershipIdInput(event.target.value) })} placeholder="CCD-2026-015" maxLength={12}/></label>
        <label>Registration number<input required inputMode="numeric" pattern="[0-9]{3,50}" value={form.registrationNumber} onChange={event => setForm({ ...form, registrationNumber: event.target.value.replace(/\D/g, '').slice(0, 50) })}/></label>
        <label>Course of study <small>(optional)</small><input value={form.courseOfStudy} onChange={event => setForm({ ...form, courseOfStudy: event.target.value })}/></label>
        <label>Year of study <small>(optional)</small><input inputMode="numeric" value={form.yearOfStudy} onChange={event => setForm({ ...form, yearOfStudy: event.target.value.replace(/\D/g, '').slice(0, 2) })}/></label>
        <label className="checkbox-control"><input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })}/><span><b>Active account</b><small>Student can sign in</small></span></label>
        <label className="wide">{editing ? 'Replacement password (optional)' : 'Password'}<input required={!editing} minLength={form.password ? 8 : undefined} type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
        <label className="wide">Confirm password<input required={!editing || Boolean(form.password)} minLength={form.confirmPassword ? 8 : undefined} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })}/></label>
      </div>
      <p className="password-hint">Use at least 8 characters with uppercase, lowercase, and a number.</p>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={closeForm}>Cancel</button><button className="portal-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add student'}</button></div>
    </form>}
    {viewing && <section className="content-card record-details" aria-label={`${viewing.fullName} details`}><div className="form-heading"><div><p>STUDENT DETAILS</p><h2>{viewing.fullName}</h2></div><button className="secondary-button" onClick={() => setViewing(null)}>Close</button></div><dl><div><dt>Student ID</dt><dd>{viewing.membershipId || 'Not set'}</dd></div><div><dt>Registration</dt><dd>{viewing.registrationNumber}</dd></div><div><dt>Email</dt><dd>{viewing.email}</dd></div><div><dt>Course</dt><dd>{viewing.courseOfStudy || 'Not set'}</dd></div><div><dt>Year</dt><dd>{viewing.yearOfStudy || 'Not set'}</dd></div><div><dt>Status</dt><dd>{viewing.isActive ? 'Active' : 'Inactive'}</dd></div></dl></section>}
    {notice && <div className="success">{notice}</div>}
    {error && !loading && <StatePanel kind="error">{error}</StatePanel>}
    <section className="content-card">
      <CardToolbar
        title="Student directory"
        meta={searchQuery ? `${visibleStudents.length} of ${students.length} records` : `${students.length} records`}
        search={{ value: searchInput, onChange: setSearchInput, onSubmit: () => applySearch(), placeholder: 'Name, student ID, registration…', label: 'Search students' }}
        onRefresh={() => void load()}
      />
      {loading ? <StatePanel kind="loading"/> : visibleStudents.length ? <DataTable columns={[{ key: 'fullName', label: 'Student' }, { key: 'membershipId', label: 'Student ID' }, { key: 'registrationNumber', label: 'Registration' }, { key: 'email', label: 'Email' }, { key: 'courseOfStudy', label: 'Course' }, { key: 'isActive', label: 'Status' }]} items={visibleStudents} renderActions={item => { const student = item as Student; return <><button onClick={() => { setViewing(student); setShowForm(false); setEditing(null) }}>View</button><button onClick={() => startEdit(student)}>Edit</button><button className="danger-button" disabled={deletingId === student.id} onClick={() => void remove(student)}>{deletingId === student.id ? 'Deleting...' : 'Delete'}</button></> }}/> : !error && <StatePanel kind="empty">{students.length ? 'No students match this search.' : 'Add the first student account to begin.'}</StatePanel>}
    </section>
  </main>
}
