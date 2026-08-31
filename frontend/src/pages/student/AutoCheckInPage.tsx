import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, message } from '../../services/api'
import { getLocation } from '../../hooks/useGeolocation'
import { formatCampusTime } from '../../lib/campusTime'

const VENUE_CODE_RE = /^[A-Z0-9]{8}$/
const CODE_KEY = 'ccd.venueCode'

type Phase = 'loading' | 'locating' | 'verifying' | 'done' | 'already' | 'error'

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
  const [status, setStatus] = useState('Preparing check-in…')
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
        const [sessionRes, currentRes, summaryRes] = await Promise.all([
          api.get('/student/attendance/active-session'),
          api.get('/student/attendance/current'),
          api.get('/student/profile/summary').catch(() => null),
        ])
        if (summaryRes) setSummary(summaryRes.data)

        const existing = currentRes.data?.record
        if (existing?.status === 'PRESENT' || existing?.status === 'LATE') {
          setRecord(existing)
          setPhase('already')
          setStatus('You have already checked in')
          return
        }
        if (existing?.status === 'CHECKED_OUT') {
          setRecord(existing)
          setPhase('already')
          setStatus('You already checked out for today')
          return
        }

        const session = sessionRes.data
        if (!session?.sessionId) throw new Error('No active attendance session right now.')
        if (!code) throw new Error('Missing venue code. Scan the QR displayed in the RAFIC room.')

        setPhase('locating')
        setStatus('Checking your location…')
        const loc = await getLocation()

        setPhase('verifying')
        setStatus('Verifying location…')
        const locRes = await api.post('/student/attendance/verify-location', {
          sessionId: session.sessionId,
          ...loc,
        })

        setStatus('Confirming venue…')
        const venueRes = await api.post('/student/attendance/verify-venue', {
          sessionId: session.sessionId,
          code,
        })

        setStatus('Recording attendance…')
        const result = await api.post('/student/attendance/check-in', {
          sessionId: session.sessionId,
          locationVerificationToken: locRes.data.locationVerificationToken,
          venueVerificationToken: venueRes.data.venueVerificationToken,
          idempotencyKey: crypto.randomUUID(),
        })

        setRecord(result.data)
        setPhase('done')
        setStatus('You successfully checked in')
        sessionStorage.removeItem(CODE_KEY)
      } catch (err) {
        const msg = message(err)
        if (/already checked in/i.test(msg)) {
          try {
            const current = await api.get('/student/attendance/current')
            setRecord(current.data?.record || null)
          } catch { /* ignore */ }
          setPhase('already')
          setStatus('You have already checked in')
          return
        }
        setError(msg)
        setPhase('error')
      }
    })()
  }, [params])

  const name = summary?.fullName || localStorage.getItem('ccd.name') || 'Student'
  const time = record?.checkInAt ? formatCampusTime(record.checkInAt) : '—'
  const statusLabel = record?.status || '—'

  return (
    <section className="face-id-shell stage-intro auto-checkin">
      <div className="face-id-copy" style={{ maxWidth: 520, margin: '0 auto' }}>
        {(phase === 'loading' || phase === 'locating' || phase === 'verifying') && (
          <>
            <p className="scan-kicker pulse-text">AUTO CHECK-IN</p>
            <h2>{status}</h2>
            <p>Stay on this page. We verify you are inside RAFIC, then mark attendance.</p>
            <div className="scan-progress" style={{ marginTop: 24 }}><i style={{ width: phase === 'loading' ? '20%' : phase === 'locating' ? '50%' : '85%' }} /></div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="scan-success-mark">✓</div>
            <p className="scan-kicker success-label">DONE</p>
            <h2>You successfully checked in</h2>
            <p>Location verified inside the training area. Attendance is recorded.</p>
            <div className="scan-details">
              {[
                { label: 'Student', value: name },
                { label: 'Student ID', value: summary?.registrationNumber || '—' },
                { label: 'Time', value: time },
                { label: 'Status', value: statusLabel },
              ].map(d => (
                <div key={d.label}><span>{d.label}</span><b>{d.value}</b></div>
              ))}
            </div>
          </>
        )}

        {phase === 'already' && (
          <>
            <div className="scan-success-mark">✓</div>
            <p className="scan-kicker success-label">ALREADY RECORDED</p>
            <h2>{status}</h2>
            <p>No further action needed for this session.</p>
            <div className="scan-details">
              {[
                { label: 'Student', value: name },
                { label: 'Student ID', value: summary?.registrationNumber || '—' },
                { label: 'Time', value: time },
                { label: 'Status', value: statusLabel },
              ].map(d => (
                <div key={d.label}><span>{d.label}</span><b>{d.value}</b></div>
              ))}
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="scan-error-mark">!</div>
            <p className="scan-kicker error-label">CHECK-IN FAILED</p>
            <h2>Could not complete check-in</h2>
            <p>{error || 'Please scan the room QR again and try once more.'}</p>
            <button className="retry-button" type="button" onClick={() => window.location.reload()}>Try again</button>
          </>
        )}
      </div>
    </section>
  )
}
