import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import FaceScanFlow, { type ScanStage } from '../../components/FaceScanFlow'
import { api, message } from '../../services/api'
import { useCameraFrames } from '../../hooks/useCameraFrames'
import { useCampusClock } from '../../hooks/useCampusClock'
import { useFaceMonitor } from '../../hooks/useFaceMonitor'
import { getLocation } from '../../hooks/useGeolocation'
import { isContinuousReading, isFreshReading, parseChallengeType, type ChallengeType } from '../../lib/captureQuality'
import { getStoredFaceEnrollment, storeFaceEnrollment } from '../../lib/auth'
import { checkoutWindow } from '../../lib/checkout'
import { campusGreeting, formatCampusDate, formatCampusTime } from '../../lib/campusTime'
import { displayMembershipId, displayRegistration } from '../../lib/studentId'
import { readStoredVenueCode, studentCheckinPath } from '../../lib/venueCheckin'

type Session = {
  sessionId:string
  title:string
  locationName:string
  permittedRadiusMeters:number
  checkInCloseAt:string
  checkoutOpensAt:string
  checkoutClosesAt:string
}
type Summary = { fullName:string; registrationNumber:string; membershipId?:string | null }
const sleep = (ms:number) => new Promise(r => window.setTimeout(r,ms))
const MAX_CAPTURE_FRAMES = 16

export default function AttendancePage() {
  const [session,setSession] = useState<Session|null>(null)
  const [summary,setSummary] = useState<Summary|null>(null)
  const [enrolled,setEnrolled] = useState(getStoredFaceEnrollment)
  const [record,setRecord] = useState<any>(null)
  const [stage,setStage] = useState<ScanStage>('intro')
  const [progress,setProgress] = useState(0)
  const [instruction,setInstruction] = useState('')
  const [scanStatus,setScanStatus] = useState('Starting scanner…')
  const [snapshot,setSnapshot] = useState('')
  const [error,setError] = useState('')
  const clock = useCampusClock()
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
      const failure = [sessionResult,summaryResult,enrollmentResult,attendanceResult].find(r=>r.status==='rejected')
      if (failure?.status==='rejected') setError(message(failure.reason))
    })
  }, [])
  useEffect(() => () => { runId.current+=1; monitor.stop(); cam.stop() }, [])

  async function waitForPosition(activeRun:number) {
    let heldFrom=0, lastSeq=monitor.current.current.sequence, prev=0
    const deadline=Date.now()+25000
    while(Date.now()<deadline && runId.current===activeRun){
      if(cam.problem.current) throw cam.problem.current
      const face=monitor.current.current
      const now=performance.now()
      if(!isFreshReading(face,lastSeq,now)){ if(prev && now-prev>350){ heldFrom=0; setScanStatus('Camera paused — hold still') } await sleep(70); continue }
      lastSeq=face.sequence; if(!isContinuousReading(face,prev)) heldFrom=0; prev=face.analyzedAt
      setInstruction('Position your face'); setScanStatus(face.hint)
      if(face.ready && Math.abs(face.yaw)<=0.12){ if(!heldFrom) heldFrom=face.analyzedAt; const held=face.analyzedAt-heldFrom; setProgress(5+Math.min(13,Math.round(held/1200*13))); if(held>=1200) return } else { heldFrom=0; setProgress(5) }
      await sleep(80)
    }
    throw new Error('Your face was not positioned in time. Center your face and try again.')
  }
  async function captureChallenge(activeRun:number,challengeType:ChallengeType,challengeInstruction:string){
    const frames:string[]=[]; const startedAt=performance.now(); let lastCapturedAt=0, lastVideoTime=-1, lastSeq=monitor.current.current.sequence, prev=0, blinkPeaks=0, eyesClosed=false, straightHeldFrom=0, actionCompleted=false
    const capture= (at:number)=>{ if(frames.length>=MAX_CAPTURE_FRAMES) return; const f=cam.grabFrame(lastVideoTime); lastVideoTime=f.videoTime; frames.push(f.dataUrl); if(frames.length===1) setSnapshot(f.dataUrl); lastCapturedAt=at }
    while(performance.now()-startedAt<22000 && runId.current===activeRun){
      if(cam.problem.current) throw cam.problem.current
      const face=monitor.current.current; const now=performance.now()
      if(!isFreshReading(face,lastSeq,now)){ if(prev && now-prev>350) straightHeldFrom=0; await sleep(70); continue }
      lastSeq=face.sequence; if(!isContinuousReading(face,prev)) straightHeldFrom=0; prev=face.analyzedAt
      const elapsed=face.analyzedAt-startedAt
      if(!face.ready){ setScanStatus(face.hint); straightHeldFrom=0; await sleep(70); continue }
      if(face.analyzedAt-lastCapturedAt>=280 && frames.length<MAX_CAPTURE_FRAMES) capture(face.analyzedAt)
      if(challengeType==='BLINK_TWICE'){ if(face.blink>=0.55 && !eyesClosed){eyesClosed=true; blinkPeaks+=1; if(face.analyzedAt!==lastCapturedAt) capture(face.analyzedAt)} if(face.blink<=0.42) eyesClosed=false; actionCompleted=blinkPeaks>=2; setScanStatus(actionCompleted?'Two blinks detected — hold still':`Blink detected ${blinkPeaks} of 2`) }
      else if(challengeType==='SMILE'){ if(!actionCompleted && face.smile>=0.45 && face.analyzedAt!==lastCapturedAt) capture(face.analyzedAt); actionCompleted=actionCompleted||face.smile>=0.45; setScanStatus(actionCompleted?'Smile detected — hold still':'Waiting for a clear smile') }
      else if(challengeType==='TURN_LEFT'){ if(!actionCompleted && face.yaw<=-0.12 && face.analyzedAt!==lastCapturedAt) capture(face.analyzedAt); actionCompleted=actionCompleted||face.yaw<=-0.12; setScanStatus(actionCompleted?'Left turn detected — hold still':'Slowly turn your head to your left') }
      else if(challengeType==='TURN_RIGHT'){ if(!actionCompleted && face.yaw>=0.12 && face.analyzedAt!==lastCapturedAt) capture(face.analyzedAt); actionCompleted=actionCompleted||face.yaw>=0.12; setScanStatus(actionCompleted?'Right turn detected — hold still':'Slowly turn your head to your right') }
      else { if(Math.abs(face.yaw)<=0.1){ if(!straightHeldFrom) straightHeldFrom=face.analyzedAt; actionCompleted=face.analyzedAt-straightHeldFrom>=1500 } else straightHeldFrom=0; setScanStatus(actionCompleted?'Straight pose confirmed — hold still':'Keep looking straight') }
      setInstruction(actionCompleted?'Completing secure face scan…':challengeInstruction)
      setProgress(Math.min(70,20+Math.round(Math.min(elapsed,4000)/4000*30)+(actionCompleted?20:challengeType==='BLINK_TWICE'?blinkPeaks*8:0)))
      if(actionCompleted && elapsed>=4000 && frames.length>=12) return frames
      await sleep(70)
    }
    throw new Error('The requested face action was not completed in time. Please try again.')
  }

  async function scanFace(){
    if(!session) return
    const checkingOut = record?.status==='PRESENT' || record?.status==='LATE'
    if(checkingOut){
      const w=checkoutWindow(session.checkoutOpensAt,session.checkoutClosesAt)
      if(w?.state==='before'){ setError(`Checkout opens at ${formatCampusTime(w.opensAt)}.`); return }
      if(!w || w.state==='closed'){ setError(`Checkout closed at ${formatCampusTime(session.checkoutClosesAt)}.`); return }
    } else if(Date.now()>new Date(session.checkInCloseAt).getTime()){ setError(`Check-in closed at ${formatCampusTime(session.checkInCloseAt)}.`); return }
    const activeRun=++runId.current
    setStage('scanning'); setProgress(2); setInstruction('Loading secure face scanner…'); setScanStatus('Allow camera access when asked'); setError('')
    let timer:number|undefined
    try{
      // Start GPS on the same tap as Face ID so iOS Safari still treats it as a user gesture.
      const locPromise=getLocation()
      await cam.start(); await monitor.start(); await waitForPosition(activeRun)
      if(runId.current!==activeRun) return
      setScanStatus('Checking training area')
      const loc=await locPromise
      const location=await api.post('/student/attendance/verify-location',{ sessionId:session.sessionId, ...loc })
      setProgress(18); setScanStatus('Face locked')
      const ch=await api.post('/student/liveness/challenge',{sessionId:session.sessionId})
      const ct=parseChallengeType(ch.data?.challengeType); const ci=typeof ch.data?.instruction==='string'&&ch.data.instruction.trim()?ch.data.instruction:'Complete the requested face action'
      const frames=await captureChallenge(activeRun,ct,ci)
      monitor.stop(); cam.stop(); setInstruction('Verifying liveness and identity…'); setScanStatus('Checking encrypted biometric profile'); setProgress(72)
      timer=window.setInterval(()=>setProgress(v=>Math.min(93,v+1)),130)
      const verified=await api.post('/student/attendance/verify-face',{ sessionId:session.sessionId, challengeToken:ch.data.challengeToken, frames })
      window.clearInterval(timer); timer=undefined; setProgress(95)
      const result=await api.post(checkingOut?'/student/attendance/check-out':'/student/attendance/check-in',{ sessionId:session.sessionId, locationVerificationToken:location.data.locationVerificationToken, faceVerificationToken:verified.data.faceVerificationToken, idempotencyKey:crypto.randomUUID() })
      setRecord(result.data); setProgress(100); window.setTimeout(()=>setStage('success'),350)
    } catch(e:any){ if(timer) window.clearInterval(timer); monitor.stop(); cam.stop(); setError(message(e)); setStage('error') }
  }

  function reset(){ runId.current+=1; monitor.stop(); cam.stop(); setProgress(0); setInstruction(''); setError(''); setStage('intro') }

  const checkedIn = record?.status==='PRESENT' || record?.status==='LATE'
  const checkout = checkedIn ? checkoutWindow(session?.checkoutOpensAt,session?.checkoutClosesAt,clock.getTime()) : null
  const checkoutLocked = checkedIn && checkout?.state!=='open'
  const checkInClosed = !checkedIn && Boolean(session && clock.getTime()>new Date(session.checkInCloseAt).getTime())
  const scheduleLocked = checkoutLocked || checkInClosed
  const checkoutOpenTime = checkout?formatCampusTime(checkout.opensAt):'2:00 PM'
  const checkoutCloseTime = checkout?formatCampusTime(checkout.closesAt):'4:00 PM'
  const introTitle = checkInClosed?`Check-in closed at ${session?formatCampusTime(session.checkInCloseAt):'2:00 PM'}`:checkout?.state==='before'?`Checkout opens at ${checkoutOpenTime}`:checkout?.state==='closed'?`Checkout closed at ${checkoutCloseTime}`:checkedIn?'Face scan to check out':'Face ID check-in'
  const introText = checkInClosed?'Today’s check-in window has ended.':checkout?.state==='before'?`Checkout is available from ${checkoutOpenTime} to ${checkoutCloseTime} campus time.`:checkout?.state==='closed'?`Today’s checkout window was ${checkoutOpenTime} to ${checkoutCloseTime}.`:checkedIn?'Complete a live Face ID scan to check out — or scan the room QR with your phone camera.':'Preferred: scan the room QR with your phone camera. Face ID below is the in-app option.'
  const actionLabel = checkout?.state==='before'?`Checkout at ${checkoutOpenTime}`:checkout?.state==='closed'?'Checkout closed':checkInClosed?'Check-in closed':checkedIn?'Ready to Check Out':'Ready to Check In'
  const pendingVenue = readStoredVenueCode()
  if (pendingVenue) return <Navigate to={studentCheckinPath(pendingVenue)} replace />

  return <div>
    <section className="hero compact-hero">
      <p className="eyebrow">CYBERSECURITY INDUSTRIAL PRACTICAL TRAINING</p>
      <h1>{campusGreeting(clock)}, {summary?.fullName || localStorage.getItem('ccd.name') || 'Student'}</h1>
      <p className="date">{formatCampusDate(clock)} · {formatCampusTime(clock)}</p>
    </section>
    {summary && session && (
      <section className="training-strip">
        <div>
          <span>DAILY PRESENCE</span>
          <b>Daily practical attendance</b>
          <small>{session.title} · {displayMembershipId(summary)} · {displayRegistration(summary)}</small>
        </div>
        <div>
          <span>TRAINING AREA</span>
          <b>{session.locationName}</b>
          <small>{session.permittedRadiusMeters} m attendance perimeter</small>
        </div>
      </section>
    )}
    <div className="student-checkin-head">
      <h2>Room QR attendance</h2>
      <p>Scan the QR in the RAFIC room with your phone camera. After login, the system checks GPS and confirms check-in or check-out automatically.</p>
    </div>
    {error && stage==='intro' && <div className="error">{error}</div>}

    {!enrolled && stage==='intro' && <div className="error" style={{marginBottom:12}}>Face ID not enrolled — <Link to="/student/face-enrollment">enrol now</Link> to use Face ID here, or scan the room QR with your phone.</div>}
    <FaceScanFlow
      stage={stage}
      videoRef={cam.video}
      progress={progress}
      instruction={instruction}
      scanStatus={scanStatus}
      faceLocked={monitor.reading.ready}
      snapshot={snapshot}
      error={error}
      errorTitle={checkedIn?'Check-out unsuccessful':'Check-in unsuccessful'}
      introTitle={introTitle}
      introText={introText}
      actionLabel={enrolled ? actionLabel : 'Enrol Face ID First'}
      successTitle={record?.status==='CHECKED_OUT'?'Checked out!':record?.status==='LATE'?'You are late':'You arrived early'}
      successText={record?.status==='CHECKED_OUT'?'Your live face matched the encrypted profile successfully.':record?.status==='LATE'?'Your arrival is verified. Official start is 11:00, so this check-in is late.':'You arrived before 11:00, so this check-in is early.'}
      details={[
        {label:'Student',value:summary?.fullName||'Student'},
        {label:'Student ID',value:displayMembershipId(summary || {})},
        {label:'Registration',value:displayRegistration(summary || {})},
        {label:'Face ID',value:record?.faceId?`${record.faceId.slice(0,8)}…`:'—'},
        {label:'Time',value:record?.checkOutAt?formatCampusTime(record.checkOutAt):record?.checkInAt?formatCampusTime(record.checkInAt):'—'},
        {label:'Status',value:record?.status==='CHECKED_OUT'?'Checked out':record?.status==='LATE'?'Late':record?.status==='PRESENT'?'Arrived early':record?.status||'Verified'},
      ]}
      disabled={!session || scheduleLocked || !enrolled}
      onStart={scanFace}
      onReset={reset}
    />
  </div>
}
