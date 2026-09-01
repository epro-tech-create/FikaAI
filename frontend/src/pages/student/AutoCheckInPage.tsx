import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, message } from '../../services/api'
import { getLocation } from '../../hooks/useGeolocation'
import { formatCampusTime } from '../../lib/campusTime'

import { extractVenueCode, readStoredVenueCode, storeVenueCode, clearStoredVenueCode } from '../../lib/venueCheckin'

type Phase = 'loading' | 'ready' | 'locating' | 'verifying' | 'done' | 'error'
type Action = 'check-in' | 'check-out'

export default function AutoCheckInPage() {
  const [params] = useSearchParams()
  const [phase, setPhase] = useState<Phase>('loading')
  const [action, setAction] = useState<Action>('check-in')
  const [status, setStatus] = useState('Preparing…')
  const [error, setError] = useState('')
  const [record, setRecord] = useState<any>(null)
  const [summary, setSummary] = useState<{ fullName?: string; registrationNumber?: string } | null>(null)
  const sessionRef = useRef<{ sessionId: string } | null>(null)
  const codeRef = useRef('')
  const checkingOutRef = useRef(false)
  const prepared = useRef(false)

  function fail(err: unknown) {
    const msg = message(err)
    if (/already checked in/i.test(msg)) {
      setAction('check-in')
      setPhase('done')
      setStatus('You have already checked in')
      return
    }
    if (/already checked out/i.test(msg)) {
      setAction('check-out')
      setPhase('done')
      setStatus('You have already checked out')
      return
    }
    setError(msg)
    setPhase('error')
  }

  useEffect(() => {
    if (prepared.current) return
    prepared.current = true

    const fromUrl = extractVenueCode(params.get('code'))
    const stored = readStoredVenueCode()
    const code = fromUrl || stored
    if (fromUrl) storeVenueCode(fromUrl)
    codeRef.current = code

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
        sessionRef.current = session

        if (existing?.status === 'CHECKED_OUT') {
          setRecord(existing)
          setAction('check-out')
          setPhase('done')
          setStatus('You have already checked out for today')
          return
        }

        const checkingOut = existing?.status === 'PRESENT' || existing?.status === 'LATE'
        checkingOutRef.current = checkingOut
        setAction(checkingOut ? 'check-out' : 'check-in')
        setStatus(checkingOut ? 'Confirm you are still in RAFIC to check out.' : 'Confirm you are inside RAFIC to check in.')
        setPhase('ready')
      } catch (err) {
        fail(err)
      }
    })()
  }, [params])

  async function completeAttendance() {
    const session = sessionRef.current
    const code = codeRef.current
    const checkingOut = checkingOutRef.current
    if (!session?.sessionId || !code) {
      setError('Missing venue code. Scan the QR displayed in the RAFIC room with your phone camera.')
      setPhase('error')
      return
    }

    try {
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
      clearStoredVenueCode()
    } catch (err) {
      if (/already checked in/i.test(message(err))) {
        try {
          const current = await api.get('/student/attendance/current')
          setRecord(current.data?.record || null)
        } catch { /* ignore */ }
      }
      if (/already checked out/i.test(message(err))) {
        try {
          const current = await api.get('/student/attendance/current')
          setRecord(current.data?.record || null)
        } catch { /* ignore */ }
      }
      fail(err)
    }
  }

  const name = summary?.fullName || localStorage.getItem('ccd.name') || 'Student'
  const isOut = action === 'check-out' || record?.status === 'CHECKED_OUT'
  const timeValue = isOut && record?.checkOutAt
    ? formatCampusTime(record.checkOutAt)
    : record?.checkInAt
      ? formatCampusTime(record.checkInAt)
      : '—'
  const isLate = record?.status === 'LATE'
  const celebrating = phase === 'done' && !/already/i.test(status)
  const checkInHeadline = isLate
    ? 'You checked in late'
    : 'Congratulations! You arrived early'
  const checkInStatusLabel = isLate ? 'Late' : 'Arrived early'

  return (
    <section className={`face-id-shell auto-checkin ${phase === 'done' ? 'stage-success auto-checkin-success' : phase === 'error' ? 'stage-error' : 'stage-intro'}`}>
      <div className="face-id-copy" style={{ maxWidth: 520, margin: '0 auto' }}>
        {(phase === 'loading' || phase === 'ready' || phase === 'locating' || phase === 'verifying') && (
          <>
            <p className="scan-kicker pulse-text">{action === 'check-out' ? 'AUTO CHECK-OUT' : 'AUTO CHECK-IN'}</p>
            <h2>{status}</h2>
            {phase === 'ready' ? (
              <>
                <p>iPhone: allow location and turn on Precise Location when Safari asks. You must be inside RAFIC.</p>
                <button className="retry-button" type="button" onClick={() => void completeAttendance()}>
                  {action === 'check-out' ? 'Allow location & check out' : 'Allow location & check in'}
                </button>
              </>
            ) : (
              <>
                <p>Stay on this page. We verify your location inside RAFIC, then finish automatically.</p>
                <div className="scan-progress" style={{ marginTop: 24 }}>
                  <i style={{ width: phase === 'loading' ? '20%' : phase === 'locating' ? '50%' : '85%' }} />
                </div>
              </>
            )}
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
                ? (isOut ? 'Congratulations! You successfully checked out' : checkInHeadline)
                : status}
            </h2>
            <p>
              {celebrating
                ? (isOut
                  ? 'Well done — your departure is verified and saved.'
                  : isLate
                    ? 'Your arrival is verified. Official start is 11:00, so this check-in is late.'
                    : 'Well done — you arrived early. Official start is 11:00.')
                : 'No further action needed for this session.'}
            </p>
            <div className="scan-details auto-checkin-details">
              {[
                { label: 'Student', value: name },
                { label: 'Student ID', value: summary?.registrationNumber || '—' },
                { label: 'Time', value: timeValue },
                { label: 'Status', value: isOut ? (record?.status || '—') : checkInStatusLabel },
              ].map(d => (
                <div key={d.label}><span>{d.label}</span><b>{d.value}</b></div>
              ))}
            </div>
            <p className="auto-checkin-nav">
              <Link to="/student/attendance">Attendance</Link>
              <Link to="/student/face-enrollment">Enrollment</Link>
            </p>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="scan-error-mark">!</div>
            <p className="scan-kicker error-label">FAILED</p>
            <h2>Could not complete {action === 'check-out' ? 'check-out' : 'check-in'}</h2>
            <p>{error || 'Please scan the room QR again and try once more.'}</p>
            <button className="retry-button" type="button" onClick={() => window.location.reload()}>Try again</button>
            <p className="auto-checkin-nav">
              <Link to="/student/attendance">Attendance</Link>
              <Link to="/student/face-enrollment">Enrollment</Link>
            </p>
          </>
        )}
      </div>
    </section>
  )
}
