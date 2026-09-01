import { useEffect, useState, type FormEvent } from 'react'
import { CardToolbar, DataTable, PageHeading, StatePanel, StatCard, type TableColumn } from '../../components/PortalUI'
import { matchesSearch } from '../../lib/tableSearch'
import type { Role } from '../../lib/auth'
import { api, message } from '../../services/api'

export type ReportPeriod = 'daily' | 'weekly' | 'monthly'

type AttendanceRow = Record<string, unknown> & {
  id: string
  day?: string
  date?: string
  studentName: string
  membershipId?: string | null
  registrationNumber: string
  arrivedAt: string | null
  checkedOutAt: string | null
  status: string
}

type StudentSummary = Record<string, unknown> & {
  studentName: string
  membershipId?: string | null
  registrationNumber: string
  daysPresent: number
  lateDays: number
  days?: Record<string, string>
}

type ReportPayload = {
  period?: ReportPeriod
  title?: string
  date?: string
  startDate?: string
  endDate?: string
  summary?: {
    totalRecords: number
    studentsPresent: number
    arrivedEarly: number
    late: number
    checkedOut: number
  }
  rows?: AttendanceRow[]
  students?: StudentSummary[]
}

const WEEKDAY_COLUMNS: TableColumn[] = [
  { key: 'studentName', label: 'Student' },
  { key: 'membershipId', label: 'Student ID' },
  { key: 'registrationNumber', label: 'Registration no.' },
  { key: 'days.Mon', label: 'Mon' },
  { key: 'days.Tue', label: 'Tue' },
  { key: 'days.Wed', label: 'Wed' },
  { key: 'days.Thu', label: 'Thu' },
  { key: 'days.Fri', label: 'Fri' },
  { key: 'daysPresent', label: 'Days' },
]

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

export function attendanceCsv(rows: AttendanceRow[], period: ReportPeriod = 'daily') {
  const includeDay = period !== 'daily'
  const header = includeDay
    ? ['Student name', 'Student ID', 'Registration number', 'Day', 'Date', 'Arrival time', 'Checkout time', 'Status']
    : ['Student name', 'Student ID', 'Registration number', 'Arrival time', 'Checkout time']
  return [header, ...rows.map(row => {
    const cells = [
      row.studentName,
      row.membershipId || '',
      row.registrationNumber,
      ...(includeDay ? [row.day || '', row.date || ''] : []),
      attendanceTime(row.arrivedAt),
      row.checkedOutAt ? attendanceTime(row.checkedOutAt) : '',
      ...(includeDay ? [attendanceStatusLabel(row.status)] : []),
    ]
    return cells
  })].map(line => line.map(csvCell).join(',')).join('\n')
}

export default function ReportsPage({ role }: { role: Extract<Role, 'admin' | 'instructor'> }) {
  const [period, setPeriod] = useState<ReportPeriod>('daily')
  const [reportDate, setReportDate] = useState('')
  const [report, setReport] = useState<ReportPayload>({})
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const rows = Array.isArray(report.rows) ? report.rows : []
  const students = Array.isArray(report.students) ? report.students : []

  async function load(date = reportDate, selectedPeriod = period) {
    setLoading(true)
    setError('')
    try {
      const response = await api.get(`/${role}/reports/attendance`, {
        params: { period: selectedPeriod, ...(date ? { date } : {}) },
      })
      const payload = (response.data || {}) as ReportPayload
      setReport(payload)
      setReportDate(String(payload.date || date))
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load('') }, [role])

  function downloadCsv() {
    const blob = new Blob([`\uFEFF${attendanceCsv(rows, period)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `ccd-attendance-${period}-${report.startDate || reportDate}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function downloadPdf() {
    setDownloading(true)
    setError('')
    try {
      const response = await api.get(`/${role}/reports/attendance.pdf`, {
        params: { period, ...(reportDate ? { date: reportDate } : {}) },
        responseType: 'blob',
      })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `ccd-attendance-${period}-${report.startDate || reportDate}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setDownloading(false)
    }
  }

  function applySearch(event?: FormEvent) {
    event?.preventDefault()
    setSearchQuery(searchInput)
  }

  function changePeriod(next: ReportPeriod) {
    setPeriod(next)
    void load(reportDate, next)
  }

  const rangeLabel = report.startDate && report.endDate && report.startDate !== report.endDate
    ? `${report.startDate} – ${report.endDate}`
    : (reportDate || 'Today')
  const tableSource = period === 'daily' ? rows : students
  const visibleItems = tableSource.filter(item => matchesSearch(item, searchQuery, ['studentName', 'membershipId', 'registrationNumber', 'status']))
  const dailyRows = visibleItems.map(row => ({
    ...row,
    arrivedAt: attendanceTime(String((row as AttendanceRow).arrivedAt || '')),
    checkedOutAt: attendanceTime((row as AttendanceRow).checkedOutAt),
    status: attendanceStatusLabel(String((row as AttendanceRow).status || '')),
  }))
  const columns: TableColumn[] = period === 'weekly'
    ? WEEKDAY_COLUMNS
    : period === 'monthly'
      ? [
          { key: 'studentName', label: 'Student' },
          { key: 'membershipId', label: 'Student ID' },
          { key: 'registrationNumber', label: 'Registration no.' },
          { key: 'daysPresent', label: 'Days present' },
          { key: 'lateDays', label: 'Late days' },
        ]
      : [
          { key: 'studentName', label: 'Student' },
          { key: 'membershipId', label: 'Student ID' },
          { key: 'registrationNumber', label: 'Registration no.' },
          { key: 'arrivedAt', label: 'Arrival time' },
          { key: 'checkedOutAt', label: 'Checkout time' },
          { key: 'status', label: 'Status' },
        ]
  const tableItems = period === 'daily' ? dailyRows : visibleItems
  const emptyCopy = period === 'weekly'
    ? 'No student attendance was recorded for this week.'
    : period === 'monthly'
      ? 'No student attendance was recorded for this month.'
      : 'No student attendance was recorded for this date.'
  const heading = period === 'weekly' ? 'Weekly attendance' : period === 'monthly' ? 'Monthly attendance' : 'Daily attendance'

  return <main className="portal-content">
    <PageHeading
      eyebrow="ATTENDANCE RECORDS"
      title="Reports"
      description="Generate daily, weekly, or monthly student attendance reports and download a formatted PDF."
      action={<div className="report-actions">
        <button type="button" className="secondary-button" disabled={!rows.length} onClick={downloadCsv}>Download CSV</button>
        <button type="button" className="portal-primary" disabled={downloading} onClick={() => void downloadPdf()}>{downloading ? 'Preparing PDF...' : 'Download PDF'}</button>
      </div>}
    />
    <section className="content-card report-controls">
      <div className="report-period" role="tablist" aria-label="Report period">
        {(['daily', 'weekly', 'monthly'] as const).map(item => (
          <button key={item} type="button" role="tab" aria-selected={period === item} className={period === item ? 'is-active' : ''} onClick={() => changePeriod(item)}>{item}</button>
        ))}
      </div>
      <label>{period === 'monthly' ? 'Any day in the month' : period === 'weekly' ? 'Any day in the week' : 'Attendance date'}<input type="date" value={reportDate} onChange={event => setReportDate(event.target.value)}/></label>
      <button className="secondary-button" disabled={!reportDate || loading} onClick={() => void load()}>{loading ? 'Loading...' : 'View report'}</button>
    </section>
    {error && <StatePanel kind="error">{error}</StatePanel>}
    {report.summary && <section className="stat-grid report-summary" aria-label="Report summary">
      <StatCard label="Students present" value={report.summary.studentsPresent} note={rangeLabel}/>
      <StatCard label="Arrived early" value={report.summary.arrivedEarly} note="Before 11:00"/>
      <StatCard label="Late" value={report.summary.late} note="From 11:00"/>
      <StatCard label="Checked out" value={report.summary.checkedOut} note="Recorded departures"/>
    </section>}
    <section className="content-card">
      <CardToolbar
        title={heading}
        meta={`${searchQuery ? `${visibleItems.length} of ${tableSource.length} students` : `${tableSource.length} students`} · ${rangeLabel}`}
        search={{ value: searchInput, onChange: setSearchInput, onSubmit: () => applySearch(), placeholder: 'Name, student ID, registration…', label: 'Search attendance report' }}
        onRefresh={() => void load()}
      />
      {loading ? <StatePanel kind="loading"/> : visibleItems.length ? <DataTable columns={columns} items={tableItems}/> : !error && <StatePanel kind="empty">{tableSource.length ? 'No attendance records match this search.' : emptyCopy}</StatePanel>}
    </section>
  </main>
}
