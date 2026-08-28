import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import FaceScanFlow, { type ScanStage } from '../../components/FaceScanFlow'
import { api, message } from '../../services/api'
import { useCameraFrames } from '../../hooks/useCameraFrames'
import { useFaceMonitor } from '../../hooks/useFaceMonitor'
import { isContinuousReading, isFreshReading, parseChallengeType, type ChallengeType } from '../../lib/captureQuality'
import { clearAuthentication, getStoredFaceEnrollment, storeFaceEnrollment } from '../../lib/auth'
import { checkoutWait, earlyCheckoutMessage } from '../../lib/checkout'

type Session = { sessionId:string; title:string; courseTitle?:string|null; locationName:string; permittedRadiusMeters:number }
type Summary = { fullName:string; registrationNumber:string }
const sleep = (milliseconds:number) => new Promise(resolve => window.setTimeout(resolve,milliseconds))

export default function AttendancePage() {
  const [session,setSession] = useState<Session|null>(null)
  const [summary,setSummary] = useState<Summary|null>(null)
  const [enrolled,setEnrolled] = useState(getStoredFaceEnrollment)
  const [record,setRecord] = useState<any>(null)
  const [stage,setStage] = useState<ScanStage>('intro')
  const [progress,setProgress] = useState(0)
  const [instruction,setInstruction] = useState('')
  const [scanStatus,setScanStatus] = useState('Starting face scanner…')
  const [snapshot,setSnapshot] = useState('')
  const [error,setError] = useState('')
  const [clock,setClock] = useState(new Date())
  const cam = useCameraFrames()
  const monitor = useFaceMonitor(cam.video)
  const runId = useRef(0)

  useEffect(() => {
    Promise.allSettled([
      api.get('/student/attendance/active-session'),
      api.get('/student/profile/summary'),
      api.get('/student/face-enrollment/status'),
      api.get('/student/attendance/current'),
    ]).then(([sessionResult,summaryResult,enrollmentResult,attendanceResult]) => {
      if (sessionResult.status === 'fulfilled') setSession(sessionResult.value.data)
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value.data)
      if (enrollmentResult.status === 'fulfilled') {
        const isEnrolled = Boolean(enrollmentResult.value.data.enrolled)
        setEnrolled(isEnrolled)
        storeFaceEnrollment(isEnrolled)
      }
      if (attendanceResult.status === 'fulfilled') setRecord(attendanceResult.value.data.record)
      const failure = [sessionResult,summaryResult,enrollmentResult,attendanceResult]
        .find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') setError(message(failure.reason))
    })
    const timer = setInterval(() => setClock(new Date()),1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => () => { runId.current += 1; monitor.stop(); cam.stop() }, [])

  async function waitForPosition(activeRun:number) {
    let heldFrom = 0
    let lastSequence = monitor.current.current.sequence
    let previousAnalyzedAt = 0
    const deadline = Date.now() + 25000
    while (Date.now() < deadline && runId.current === activeRun) {
      if (cam.problem.current) throw cam.problem.current
      const face = monitor.current.current
      const now = performance.now()
      if (!isFreshReading(face,lastSequence,now)) {
        if (previousAnalyzedAt && now - previousAnalyzedAt > 350) {
          heldFrom = 0
          setScanStatus('Camera paused — hold still while it resumes')
        }
        await sleep(70)
        continue
      }
      lastSequence = face.sequence
      if (!isContinuousReading(face,previousAnalyzedAt)) heldFrom = 0
      previousAnalyzedAt = face.analyzedAt
      setInstruction('Position your face')
      setScanStatus(face.hint)
      if (face.ready && Math.abs(face.yaw) <= 0.12) {
        if (!heldFrom) heldFrom = face.analyzedAt
        const held = face.analyzedAt - heldFrom
        setProgress(5 + Math.min(13,Math.round(held / 1200 * 13)))
        if (held >= 1200) return
      } else {
        heldFrom = 0
        setProgress(5)
      }
      await sleep(80)
    }
    throw new Error('Your face was not positioned in time. Center your face and try again.')
  }

  async function captureChallenge(activeRun:number,challengeType:ChallengeType,challengeInstruction:string) {
    const frames:string[] = []
    const startedAt = performance.now()
    let lastCapturedAt = 0
    let lastCapturedVideoTime = -1
    let lastSequence = monitor.current.current.sequence
    let previousAnalyzedAt = 0
    let blinkPeaks = 0
    let eyesClosed = false
    let straightHeldFrom = 0
    let actionCompleted = false
    const captureActionFrame = (analyzedAt:number) => {
      if (frames.length >= 24) return
      const frame = cam.grabFrame(lastCapturedVideoTime)
      lastCapturedVideoTime = frame.videoTime
      frames.push(frame.dataUrl)
      if (frames.length === 1) setSnapshot(frame.dataUrl)
      lastCapturedAt = analyzedAt
    }

    while (performance.now() - startedAt < 22000 && runId.current === activeRun) {
      if (cam.problem.current) throw cam.problem.current
      const face = monitor.current.current
      const now = performance.now()
      if (!isFreshReading(face,lastSequence,now)) {
        if (previousAnalyzedAt && now - previousAnalyzedAt > 350) {
          straightHeldFrom = 0
          setScanStatus('Camera paused — hold still while it resumes')
        }
        await sleep(70)
        continue
      }
      lastSequence = face.sequence
      if (!isContinuousReading(face,previousAnalyzedAt)) straightHeldFrom = 0
      previousAnalyzedAt = face.analyzedAt
      const elapsed = face.analyzedAt - startedAt
      if (!face.ready) {
        setScanStatus(face.hint)
        straightHeldFrom = 0
        await sleep(70)
        continue
      }

      if (face.analyzedAt - lastCapturedAt >= 220 && frames.length < 24) {
        captureActionFrame(face.analyzedAt)
      }

      if (challengeType === 'BLINK_TWICE') {
        if (face.blink >= 0.55 && !eyesClosed) { eyesClosed = true; blinkPeaks += 1; if (face.analyzedAt !== lastCapturedAt) captureActionFrame(face.analyzedAt) }
        if (face.blink <= 0.42) eyesClosed = false
        actionCompleted = blinkPeaks >= 2
        setScanStatus(actionCompleted ? 'Two blinks detected — hold still' : `Blink detected ${blinkPeaks} of 2`)
      } else if (challengeType === 'SMILE') {
        if (!actionCompleted && face.smile >= 0.45 && face.analyzedAt !== lastCapturedAt) captureActionFrame(face.analyzedAt)
        actionCompleted = actionCompleted || face.smile >= 0.45
        setScanStatus(actionCompleted ? 'Smile detected — hold still' : 'Waiting for a clear smile')
      } else if (challengeType === 'TURN_LEFT') {
        if (!actionCompleted && face.yaw <= -0.12 && face.analyzedAt !== lastCapturedAt) captureActionFrame(face.analyzedAt)
        actionCompleted = actionCompleted || face.yaw <= -0.12
        setScanStatus(actionCompleted ? 'Left turn detected — hold still' : 'Slowly turn your head to your left')
      } else if (challengeType === 'TURN_RIGHT') {
        if (!actionCompleted && face.yaw >= 0.12 && face.analyzedAt !== lastCapturedAt) captureActionFrame(face.analyzedAt)
        actionCompleted = actionCompleted || face.yaw >= 0.12
        setScanStatus(actionCompleted ? 'Right turn detected — hold still' : 'Slowly turn your head to your right')
      } else {
        if (Math.abs(face.yaw) <= 0.1) {
          if (!straightHeldFrom) straightHeldFrom = face.analyzedAt
          actionCompleted = face.analyzedAt - straightHeldFrom >= 1500
        } else straightHeldFrom = 0
        setScanStatus(actionCompleted ? 'Straight pose confirmed — hold still' : 'Keep looking straight at the camera')
      }

      const actionProgress = actionCompleted ? 20 : challengeType === 'BLINK_TWICE' ? blinkPeaks * 8 : 0
      setInstruction(actionCompleted ? 'Completing secure face scan…' : challengeInstruction)
      setProgress(Math.min(70,20 + Math.round(Math.min(elapsed,4000) / 4000 * 30) + actionProgress))
      if (actionCompleted && elapsed >= 4000 && frames.length >= 12) return frames
      await sleep(70)
    }
    throw new Error('The requested face action was not completed in time. Please try again.')
  }

  async function scan() {
    if (!session || !enrolled) return
    const checkoutError = (record?.status === 'PRESENT' || record?.status === 'LATE')
      ? earlyCheckoutMessage(record?.checkInAt)
      : ''
    if (checkoutError) {
      setError(checkoutError)
      return
    }
    const activeRun = ++runId.current
    setStage('scanning'); setProgress(2); setInstruction('Loading secure face scanner…'); setScanStatus('Allow camera access when asked'); setError('')
    let processingTimer: number | undefined
    try {
      await cam.start()
      await monitor.start()
      await waitForPosition(activeRun)
      if (runId.current !== activeRun) return
      const location = await api.post('/student/attendance/verify-location', {
        sessionId:session.sessionId, latitude:0, longitude:0, accuracyMeters:0,
        capturedAt:new Date().toISOString(),
      })
      setProgress(18); setScanStatus('Face locked')
      const challenge = await api.post('/student/liveness/challenge',{sessionId:session.sessionId})
      const challengeType = parseChallengeType(challenge.data?.challengeType)
      const challengeInstruction = typeof challenge.data?.instruction === 'string' && challenge.data.instruction.trim()
        ? challenge.data.instruction
        : 'Complete the requested face action'
      const frames = await captureChallenge(activeRun,challengeType,challengeInstruction)
      monitor.stop(); cam.stop(); setInstruction('Verifying liveness and identity…'); setScanStatus('Checking encrypted biometric profile'); setProgress(72)
      processingTimer = window.setInterval(() => setProgress(value => Math.min(93,value + 1)),130)
      const verified = await api.post('/student/attendance/verify-face',{
        sessionId:session.sessionId,
        challengeToken:challenge.data.challengeToken,
        frames,
      })
      window.clearInterval(processingTimer); processingTimer = undefined; setProgress(95)
      const checkingOut = record?.status === 'PRESENT' || record?.status === 'LATE'
      const result = await api.post(
        checkingOut ? '/student/attendance/check-out' : '/student/attendance/check-in',
        {
          sessionId:session.sessionId,
          locationVerificationToken:location.data.locationVerificationToken,
          faceVerificationToken:verified.data.faceVerificationToken,
          idempotencyKey:crypto.randomUUID(),
        },
      )
      setRecord(result.data); setProgress(100)
      window.setTimeout(() => setStage('success'),350)
    } catch (requestError) {
      if (processingTimer) window.clearInterval(processingTimer)
      monitor.stop(); cam.stop(); setError(message(requestError)); setStage('error')
    }
  }

  function reset() { runId.current += 1; monitor.stop(); cam.stop(); setProgress(0); setInstruction(''); setError(''); setStage('intro') }
  const checkedIn = record?.status === 'PRESENT' || record?.status === 'LATE'
  const checkout = checkedIn ? checkoutWait(record?.checkInAt,clock.getTime()) : null
  const checkoutLocked = Boolean(checkout?.remainingMs)
  const checkoutTime = checkout ? new Date(checkout.availableAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : ''

  return <main className="app">
    <header className="student-header"><Link className="brand" to="/">CCD-<span>Attendance</span></Link><nav><Link to="/student/attendance">Attendance</Link><Link to="/student/face-enrollment">Face enrolment</Link><button className="ghost" onClick={() => { clearAuthentication(); window.location.href = '/login' }}>Sign out</button></nav></header>
    <section className="hero compact-hero"><p className="eyebrow">CYBERSECURITY INDUSTRIAL PRACTICAL TRAINING</p><h1>Good morning, {summary?.fullName || localStorage.getItem('fikaai.name') || 'Student'}</h1><p className="date">{clock.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})} · {clock.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p></section>
    {summary && session && <section className="training-strip"><div><span>DAILY PRESENCE</span><b>{session.courseTitle || 'Daily practical attendance'}</b><small>{session.title} · {summary.registrationNumber}</small></div><div><span>TRAINING AREA</span><b>{session.locationName}</b><small>{session.permittedRadiusMeters} m attendance perimeter</small></div></section>}
    {!enrolled && <div className="error">A compatible Face ID is required. <Link to="/student/face-enrollment">Enrol your face now</Link>.</div>}
    {error && stage === 'intro' && <div className="error">{error}</div>}
    <FaceScanFlow
      stage={stage}
      videoRef={cam.video}
      progress={progress}
      instruction={instruction}
      scanStatus={scanStatus}
      faceLocked={monitor.reading.ready}
      snapshot={snapshot}
      error={error}
      introTitle={checkoutLocked ? `Checkout available at ${checkoutTime}` : checkedIn ? 'Scan to check out' : 'Scan your Face ID'}
      introText={checkoutLocked ? 'Checkout unlocks three hours after your recorded check-in.' : checkedIn ? 'Complete a fresh live scan to record your departure.' : 'Confirm your identity with a secure live facial scan. Your images are processed temporarily and never stored.'}
      actionLabel={checkoutLocked ? `Checkout at ${checkoutTime}` : checkedIn ? 'Ready to Check Out' : 'Ready to Scan'}
      successTitle={record?.status === 'CHECKED_OUT' ? 'Checked out!' : 'You are in!'}
      successText="Your live face matched the encrypted profile successfully."
      details={[
        {label:'Student',value:summary?.fullName || 'Student'},
        {label:'Student ID',value:summary?.registrationNumber || '—'},
        {label:'Face ID',value:record?.faceId ? `${record.faceId.slice(0,8)}…` : '—'},
        {label:'Time',value:record?.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : record?.checkInAt ? new Date(record.checkInAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'},
        {label:'Status',value:record?.status || 'Verified'},
      ]}
      disabled={!enrolled || !session || checkoutLocked}
      onStart={scan}
      onReset={reset}
    />
  </main>
}
