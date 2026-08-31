import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, message } from '../../services/api'
import { getLocation } from '../../hooks/useGeolocation'
import { formatCampusTime } from '../../lib/campusTime'

const VENUE_CODE_RE = /^[A-Z0-9]{8}$/
const CODE_KEY = 'ccd.venueCode'

type Phase = 'loading' | 'locating' | 'verifying' | 'done' | 'error'
type Action = 'check-in' | 'check-out'

function extractCode(raw: string | null) {
  if (!raw) return ''
  const upper = raw.trim().toUpperCase()
  if (VENUE_CODE_RE.test(upper)) return upper
  try {
    const url = new URL(raw)
    const fromQuery = (url.searchParams.get('code') || '').toUpperCase()
    if (VENUE_CODE_RE.test(fromQuery)) return fromQuery
  } catch { /* not a URL */ }
  const m = upper.match(/[A-Z0-9]{8}/)
  return m && VENUE_CODE_RE.test(m[0]) ? m[0] : ''
}

export default function AutoCheckInPage() {
  const [params] = useSearchParams()
  const [phase, setPhase] = useState<Phase>('loading')
  const [action, setAction] = useState<Action>('check-in')
  const [status, setStatus] = useState('Preparing…')
  const [error, setError] = useState('')
  const [record, setRecord] = useState<any>(null)
  const [summary, setSummary] = useState<{ fullName?: string; registrationNumber?: string } | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const fromUrl = extractCode(params.get('code'))
    const stored = (sessionStorage.getItem(CODE_KEY) || '').toUpperCase()
    const code = fromUrl || (VENUE_CODE_RE.test(stored) ? stored : '')
    if (fromUrl) sessionStorage.setItem(CODE_KEY, fromUrl)

    ;(async () => {
      try {
        if (!code) throw new Error('Missing venue code. Scan the QR displayed in the RAFIC room with your phone camera.')

        const [sessionRes, currentRes, summaryRes] = await Promise.all([
          api.get('/student/attendance/active-session'),
          api.get('/student/attendance/current'),
          api.get('/student/profile/summary').catch(() => null),
        ])
        if (summaryRes) setSummary(summaryRes.data)

        const existing = currentRes.data?.record
        const session = sessionRes.data
        if (!session?.sessionId) throw new Error('No active attendance session right now.')

        if (existing?.status === 'CHECKED_OUT') {
          setRecord(existing)
          setAction('check-out')
          setPhase('done')
          setStatus('You have already checked out for today')
          return
        }

        const checkingOut = existing?.status === 'PRESENT' || existing?.status === 'LATE'
        setAction(checkingOut ? 'check-out' : 'check-in')

        setPhase('locating')
        setStatus(checkingOut ? 'Checking your location for check-out…' : 'Checking your location for check-in…')
        const loc = await getLocation()

        setPhase('verifying')
        setStatus('Verifying you are inside RAFIC…')
        const locRes = await api.post('/student/attendance/verify-location', {
          sessionId: session.sessionId,
          ...loc,
        })

        setStatus('Confirming venue QR…')
        const venueRes = await api.post('/student/attendance/verify-venue', {
          sessionId: session.sessionId,
          code,
        })

        setStatus(checkingOut ? 'Recording check-out…' : 'Recording check-in…')
        const result = await api.post(
          checkingOut ? '/student/attendance/check-out' : '/student/attendance/check-in',
          {
            sessionId: session.sessionId,
            locationVerificationToken: locRes.data.locationVerificationToken,
            venueVerificationToken: venueRes.data.venueVerificationToken,
            idempotencyKey: crypto.randomUUID(),
          },
        )

        setRecord(result.data)
        setPhase('done')
        setStatus(checkingOut ? 'You successfully checked out' : 'You successfully checked in')
        sessionStorage.removeItem(CODE_KEY)
      } catch (err) {
        const msg = message(err)
        if (/already checked in/i.test(msg)) {
          try {
            const current = await api.get('/student/attendance/current')
            setRecord(current.data?.record || null)
          } catch { /* ignore */ }
          setAction('check-in')
          setPhase('done')
          setStatus('You have already checked in')
          return
        }
        if (/already checked out/i.test(msg)) {
          try {
            const current = await api.get('/student/attendance/current')
            setRecord(current.data?.record || null)
          } catch { /* ignore */ }
          setAction('check-out')
          setPhase('done')
          setStatus('You have already checked out')
          return
        }
        setError(msg)
        setPhase('error')
      }
    })()
  }, [params])

  const name = summary?.fullName || localStorage.getItem('ccd.name') || 'Student'
  const isOut = action === 'check-out' || record?.status === 'CHECKED_OUT'
  const timeValue = isOut && record?.checkOutAt
    ? formatCampusTime(record.checkOutAt)
    : record?.checkInAt
      ? formatCampusTime(record.checkInAt)
      : '—'
  const celebrating = phase === 'done' && !/already/i.test(status)

  return (
    <section className={`face-id-shell auto-checkin ${phase === 'done' ? 'stage-success auto-checkin-success' : phase === 'error' ? 'stage-error' : 'stage-intro'}`}>
      <div className="face-id-copy" style={{ maxWidth: 520, margin: '0 auto' }}>
        {(phase === 'loading' || phase === 'locating' || phase === 'verifying') && (
          <>
            <p className="scan-kicker pulse-text">{action === 'check-out' ? 'AUTO CHECK-OUT' : 'AUTO CHECK-IN'}</p>
            <h2>{status}</h2>
            <p>Stay on this page. We verify your location inside RAFIC, then finish automatically.</p>
            <div className="scan-progress" style={{ marginTop: 24 }}>
              <i style={{ width: phase === 'loading' ? '20%' : phase === 'locating' ? '50%' : '85%' }} />
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="scan-success-mark auto-checkin-ok">✓</div>
            <p className="scan-kicker success-label auto-checkin-ok-label">
              {celebrating ? 'CONGRATULATIONS' : 'ALREADY RECORDED'}
            </p>
            <h2 className="auto-checkin-ok-title">
              {celebrating
                ? (isOut ? 'Congratulations! You successfully checked out' : 'Congratulations! You successfully checked in')
                : status}
            </h2>
            <p>
              {celebrating
                ? (isOut
                  ? 'Well done — your departure is verified and saved.'
                  : 'Well done — your attendance is verified and saved.')
                : 'No further action needed for this session.'}
            </p>
            <div className="scan-details auto-checkin-details">
              {[
                { label: 'Student', value: name },
                { label: 'Student ID', value: summary?.registrationNumber || '—' },
                { label: 'Time', value: timeValue },
                { label: 'Status', value: record?.status || '—' },
              ].map(d => (
                <div key={d.label}><span>{d.label}</span><b>{d.value}</b></div>
              ))}
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="scan-error-mark">!</div>
            <p className="scan-kicker error-label">FAILED</p>
            <h2>Could not complete {action === 'check-out' ? 'check-out' : 'check-in'}</h2>
            <p>{error || 'Please scan the room QR again and try once more.'}</p>
            <button className="retry-button" type="button" onClick={() => window.location.reload()}>Try again</button>
          </>
        )}
      </div>
    </section>
  )
}
