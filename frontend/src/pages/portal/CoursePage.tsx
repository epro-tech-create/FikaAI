import { useEffect, useState, type FormEvent } from 'react'
import { CardToolbar, DataTable, PageHeading, StatePanel } from '../../components/PortalUI'
import { matchesSearch } from '../../lib/tableSearch'
import { api, message } from '../../services/api'

type Course = Record<string, unknown> & { id: string; code: string; title: string }
type CourseForm = { code: string; title: string }

const emptyForm: CourseForm = { code: '', title: '' }

export function normalizeCourseCode(code: string) {
  return code.trim().toUpperCase()
}

export function courseFormError(form: CourseForm) {
  if (!normalizeCourseCode(form.code)) return 'Course code is required.'
  if (!form.title.trim()) return 'Course title is required.'
  return ''
}

export default function CoursePage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [form, setForm] = useState<CourseForm>(emptyForm)
  const [editing, setEditing] = useState<Course | null>(null)
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
    return api.get('/admin/courses')
      .then(response => setCourses(Array.isArray(response.data) ? response.data : []))
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

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const validationError = courseFormError(form)
    if (validationError) {
      setError(validationError)
      return
    }
    const payload = { code: normalizeCourseCode(form.code), title: form.title.trim() }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (editing) await api.patch(`/admin/courses/${editing.id}`, payload)
      else await api.post('/admin/courses', payload)
      const wasEditing = Boolean(editing)
      closeForm()
      setNotice(`${payload.code} was ${wasEditing ? 'updated' : 'added'} successfully.`)
      await load()
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setSaving(false)
    }
  }

  async function remove(course: Course) {
    if (!window.confirm(`Delete ${course.code} permanently? This cannot be undone.`)) return
    setDeletingId(course.id)
    setError('')
    setNotice('')
    try {
      await api.delete(`/admin/courses/${course.id}`)
      setCourses(current => current.filter(item => item.id !== course.id))
      setNotice(`${course.code} was permanently deleted.`)
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

  const visibleCourses = courses.filter(course => matchesSearch(course, searchQuery, ['code', 'title']))

  return <main className="portal-content">
    <PageHeading eyebrow="ACADEMIC CATALOGUE" title="Courses" description="Maintain the course codes and titles used throughout attendance records." action={<button className="portal-primary" onClick={() => { if (showForm) closeForm(); else { setShowForm(true); setEditing(null); setForm(emptyForm); setError(''); setNotice('') } }}>{showForm ? 'Close form' : 'Add course'}</button>}/>
    {showForm && <form className="content-card session-form" onSubmit={save}>
      <div className="form-heading"><div><p>{editing ? 'EDIT COURSE' : 'NEW COURSE'}</p><h2>{editing ? 'Update course' : 'Course details'}</h2></div><span>Codes are stored in uppercase</span></div>
      <div className="form-grid">
        <label className="wide">Course code<input required value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="CS401"/></label>
        <label className="wide">Course title<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Applied Cybersecurity"/></label>
      </div>
      <div className="form-actions"><button type="button" className="secondary-button" onClick={closeForm}>Cancel</button><button className="portal-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Add course'}</button></div>
    </form>}
    {notice && <div className="success">{notice}</div>}
    {error && !loading && <StatePanel kind="error">{error}</StatePanel>}
    <section className="content-card">
      <CardToolbar
        title="Course catalogue"
        meta={searchQuery ? `${visibleCourses.length} of ${courses.length} records` : `${courses.length} records`}
        search={{ value: searchInput, onChange: setSearchInput, onSubmit: () => applySearch(), placeholder: 'Code or title…', label: 'Search courses' }}
        onRefresh={() => void load()}
      />
      {loading ? <StatePanel kind="loading"/> : visibleCourses.length ? <DataTable columns={[{ key: 'code', label: 'Code' }, { key: 'title', label: 'Course' }, { key: 'createdAt', label: 'Created' }]} items={visibleCourses} renderActions={item => { const course = item as Course; return <><button onClick={() => { setEditing(course); setForm({ code: course.code, title: course.title }); setShowForm(true); setError(''); setNotice('') }}>Edit</button><button className="danger-button" disabled={deletingId === course.id} onClick={() => void remove(course)}>{deletingId === course.id ? 'Deleting...' : 'Delete'}</button></> }}/> : !error && <StatePanel kind="empty">{courses.length ? 'No courses match this search.' : 'Add the first course to begin.'}</StatePanel>}
    </section>
  </main>
}
