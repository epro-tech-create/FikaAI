import { useEffect, useState, type FormEvent } from 'react'
import { DataTable, PageHeading, StatePanel } from '../../components/PortalUI'
import { matchesSearch } from '../../lib/tableSearch'
import { api, message } from '../../services/api'

type AttendanceRow = Record<string, unknown> & {
  id: string
  studentName: string
  registrationNumber: string
  arrivedAt: string
  checkedOutAt: string | null
  status: string
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function attendanceTime(value: string | null) {
  if (!value) return 'Not checked out'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value))
}

export function attendanceStatusLabel(status: string) {
  if (status === 'PRESENT') return 'Arrived early'
  if (status === 'LATE') return 'Late'
  if (status === 'CHECKED_OUT') return 'Checked out'
  return status.replace(/_/g, ' ')
}

export function attendanceCsv(rows: AttendanceRow[]) {
  const header = ['Student name', 'Registration number', 'Arrival time', 'Checkout time']
  return [header, ...rows.map(row => [
    row.studentName,
    row.registrationNumber,
    attendanceTime(row.arrivedAt),
    row.checkedOutAt ? attendanceTime(row.checkedOutAt) : '',
  ])].map(line => line.map(csvCell).join(',')).join('\n')
}

export default function ReportsPage() {
  const [reportDate, setReportDate] = useState('')
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  async function load(date = reportDate) {
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/admin/reports/attendance', { params: date ? { date } : {} })
      setRows(Array.isArray(response.data?.rows) ? response.data.rows : [])
      setReportDate(String(response.data?.date || date))
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load('') }, [])

  function download() {
    const blob = new Blob([`\uFEFF${attendanceCsv(rows)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `attendance-${reportDate}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function applySearch(event?: FormEvent) {
    event?.preventDefault()
    setSearchQuery(searchInput)
  }

  const visibleRows = rows.filter(row => matchesSearch(row, searchQuery, ['studentName', 'registrationNumber', 'status']))
  const tableRows = visibleRows.map(row => ({
    ...row,
    arrivedAt: attendanceTime(row.arrivedAt),
    checkedOutAt: attendanceTime(row.checkedOutAt),
    status: attendanceStatusLabel(row.status),
  }))

  return <main className="portal-content">
    <PageHeading eyebrow="ATTENDANCE RECORDS" title="Reports" description="Review and download daily student arrival and checkout records." action={<button className="portal-primary" disabled={!rows.length} onClick={download}>Download CSV</button>}/>
    <section className="content-card report-controls"><label>Attendance date<input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)}/></label><button className="secondary-button" disabled={!reportDate || loading} onClick={() => void load()}>{loading ? 'Loading...' : 'View report'}</button></section>
    {error && <StatePanel kind="error">{error}</StatePanel>}
    <section className="content-card"><div className="card-toolbar"><div><b>Daily attendance</b><span>{searchQuery ? `${visibleRows.length} of ${rows.length} students` : `${rows.length} students`} · {reportDate || 'Today'}</span></div>
      <div className="card-toolbar-actions">
        <form className="table-search" onSubmit={applySearch}>
          <input type="search" value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Name, registration, status…" aria-label="Search attendance report"/>
          <button type="submit" className="portal-primary">Search</button>
        </form>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </div>
    </div>
      {loading ? <StatePanel kind="loading"/> : visibleRows.length ? <DataTable columns={[{ key: 'studentName', label: 'Student' }, { key: 'registrationNumber', label: 'Registration no.' }, { key: 'arrivedAt', label: 'Arrival time' }, { key: 'checkedOutAt', label: 'Checkout time' }, { key: 'status', label: 'Status' }]} items={tableRows}/> : !error && <StatePanel kind="empty">{rows.length ? 'No attendance records match this search.' : 'No student attendance was recorded for this date.'}</StatePanel>}
    </section>
  </main>
}
