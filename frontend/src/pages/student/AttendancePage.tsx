import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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

type Session = {
  sessionId:string
  title:string
  courseTitle?:string|null
  locationName:string
  permittedRadiusMeters:number
  checkInCloseAt:string
  checkoutOpensAt:string
  checkoutClosesAt:string
}
type Summary = { fullName:string; registrationNumber:string }
const sleep = (ms:number) => new Promise(r => window.setTimeout(r,ms))
const MAX_CAPTURE_FRAMES = 16
const VENUE_CODE_RE = /^[A-Z0-9]{8}$/

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
  // venue mode
  const [mode,setMode] = useState<'venue'|'face'>('face')
  const [venueCode,setVenueCode] = useState('')
  const [venueBusy,setVenueBusy] = useState(false)
  const [showQrScanner,setShowQrScanner] = useState(false)
  const qrVideoRef = useRef<HTMLVideoElement|null>(null)
  const qrStreamRef = useRef<MediaStream|null>(null)
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
  useEffect(() => () => { runId.current+=1; monitor.stop(); cam.stop(); stopQrScanner() }, [])

  function stopQrScanner(){ if(qrStreamRef.current){ qrStreamRef.current.getTracks().forEach(t=>t.stop()); qrStreamRef.current=null } if(qrVideoRef.current) qrVideoRef.current.srcObject=null }

  async function startQrScanner(){
    setError('')
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment', width:{ideal:640}, height:{ideal:480}}})
      qrStreamRef.current=stream
      if(qrVideoRef.current){ qrVideoRef.current.srcObject=stream; await qrVideoRef.current.play() }
      setShowQrScanner(true)
      scanQrLoop()
    } catch(e:any){ setError(message(e)) }
  }

  async function scanQrLoop(){
    const BarcodeDetectorAny = (window as any).BarcodeDetector
    let detector: any = null
    if (BarcodeDetectorAny) { try{ detector=new BarcodeDetectorAny({formats:['qr_code']}) }catch{} }
    const start = performance.now()
    while(showQrScanner || qrStreamRef.current){
      if(!qrVideoRef.current) { await sleep(100); continue }
      try{
        if(detector){
          const barcodes = await detector.detect(qrVideoRef.current)
          if(barcodes.length>0){
            const raw = String(barcodes[0].rawValue||'').trim().toUpperCase()
            const m = raw.match(/[A-Z0-9]{8}/)
            const code = m ? m[0] : raw
            if(VENUE_CODE_RE.test(code)){
              stopQrScanner(); setShowQrScanner(false); setVenueCode(code); await submitVenue(code)
              return
            }
          }
        }
      }catch{}
      if(performance.now()-start>30000){ setError('QR scan timed out. Please try again.'); stopQrScanner(); setShowQrScanner(false); return }
      await sleep(200)
    }
  }

  // —— face helpers (kept as fallback) ——
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

  async function submitVenue(rawInput?:string){
    const code = (rawInput ?? venueCode).trim().toUpperCase()
    if(!VENUE_CODE_RE.test(code)){ setError('Invalid QR. Please scan the QR displayed in the RAFIC room.'); return }
    if(!session){ setError('No active session.'); return }
    const checkingOut = record?.status==='PRESENT' || record?.status==='LATE'
    // schedule check before even asking location
    if(checkingOut){
      const w=checkoutWindow(session.checkoutOpensAt,session.checkoutClosesAt)
      if(w?.state==='before'){ setError(`Checkout opens at ${formatCampusTime(w.opensAt)}.`); return }
      if(!w || w.state==='closed'){ setError(`Checkout closed at ${formatCampusTime(session.checkoutClosesAt)}.`); return }
    } else if(Date.now()>new Date(session.checkInCloseAt).getTime()){ setError(`Check-in closed at ${formatCampusTime(session.checkInCloseAt)}.`); return }

    setVenueBusy(true); setError(''); setStage('scanning'); setProgress(5); setInstruction('Verifying location — allow when prompted'); setScanStatus('Requesting location permission…')
    try{
      // 1) GPS — prompt appears now, automatic
      const loc = await getLocation()
      setProgress(18); setScanStatus('Location acquired — verifying in RAFIC area…')
      const locRes = await api.post('/student/attendance/verify-location',{ sessionId:session.sessionId, ...loc })
      setProgress(45); setScanStatus('QR — verifying in room…')
      // 2) venue — automatic, no extra click
      const venueRes = await api.post('/student/attendance/verify-venue',{ sessionId:session.sessionId, code })
      setProgress(72); setScanStatus('Location + venue verified — recording attendance…')
      setInstruction('Recording attendance…')
      const result = await api.post(checkingOut?'/student/attendance/check-out':'/student/attendance/check-in',{
        sessionId:session.sessionId,
        locationVerificationToken: locRes.data.locationVerificationToken,
        venueVerificationToken: venueRes.data.venueVerificationToken,
        idempotencyKey: crypto.randomUUID(),
      })
      setRecord(result.data); setProgress(100); setSnapshot('')
      window.setTimeout(()=>setStage('success'),350)
    } catch(e:any){ setError(message(e)); setStage('error') }
    finally{ setVenueBusy(false) }
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
      await cam.start(); await monitor.start(); await waitForPosition(activeRun)
      if(runId.current!==activeRun) return
      setScanStatus('Checking training area')
      const loc=await getLocation()
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

  function reset(){ runId.current+=1; monitor.stop(); cam.stop(); stopQrScanner(); setShowQrScanner(false); setProgress(0); setInstruction(''); setError(''); setStage('intro') }

  const checkedIn = record?.status==='PRESENT' || record?.status==='LATE'
  const checkout = checkedIn ? checkoutWindow(session?.checkoutOpensAt,session?.checkoutClosesAt,clock.getTime()) : null
  const checkoutLocked = checkedIn && checkout?.state!=='open'
  const checkInClosed = !checkedIn && Boolean(session && clock.getTime()>new Date(session.checkInCloseAt).getTime())
  const scheduleLocked = checkoutLocked || checkInClosed
  const checkoutOpenTime = checkout?formatCampusTime(checkout.opensAt):'2:00 PM'
  const checkoutCloseTime = checkout?formatCampusTime(checkout.closesAt):'4:00 PM'
  const introTitle = checkInClosed?`Check-in closed at ${session?formatCampusTime(session.checkInCloseAt):'2:00 PM'}`:checkout?.state==='before'?`Checkout opens at ${checkoutOpenTime}`:checkout?.state==='closed'?`Checkout closed at ${checkoutCloseTime}`:checkedIn?'Scan to check out':'Check in at RAFIC'
  // TESTING: whole-day — keep text generic so it matches 00:00-23:59 window
  const introText = checkInClosed?'Today’s check-in window has ended.':checkout?.state==='before'?`Checkout is available from ${checkoutOpenTime} to ${checkoutCloseTime} campus time.`:checkout?.state==='closed'?`Today’s checkout window was ${checkoutOpenTime} to ${checkoutCloseTime}.`:checkedIn?'Complete check-out by scanning the QR — available all day (testing).':'Scan the QR displayed in the RAFIC room. Location will be requested automatically — same QR works all day for check-in & check-out (testing).'
  const actionLabel = checkout?.state==='before'?`Checkout at ${checkoutOpenTime}`:checkout?.state==='closed'?'Checkout closed':checkInClosed?'Check-in closed':checkedIn?'Ready to Check Out':'Ready to Check In'
  const venueDisabled = !session || scheduleLocked || venueBusy

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
          <b>{session.courseTitle || 'Daily practical attendance'}</b>
          <small>{session.title} · {summary.registrationNumber}</small>
        </div>
        <div>
          <span>TRAINING AREA</span>
          <b>{session.locationName}</b>
          <small>{session.permittedRadiusMeters} m attendance perimeter</small>
        </div>
      </section>
    )}
    <div className="student-checkin-head">
      <h2>{checkedIn ? 'Check out' : 'Check in'}</h2>
      <p>{checkedIn ? 'Scan QR to record your departure — available all day (testing).' : 'Scan the QR in the RAFIC room to mark attendance. GPS verifies you inside 100 m.'}</p>
    </div>
    {error && stage==='intro' && <div className="error">{error}</div>}

    <div style={{display:'flex', gap:8, margin:'12px 0', justifyContent:'center'}}>
      <button onClick={()=>setMode('venue')} className={`mode-btn ${mode==='venue'?'active':''}`}>QR Scan</button>
      <button onClick={()=>setMode('face')} className={`mode-btn ${mode==='face'?'active':''}`}>Face ID {enrolled?'':' (not enrolled)'}</button>
    </div>

    {mode==='venue' ? (
      stage==='intro' ? (
        <section className="face-id-shell stage-intro">
          <div className="face-id-copy" style={{maxWidth:520, margin:'0 auto'}}>
            <p className="scan-kicker">QR SCAN + GPS</p>
            <h2>{introTitle}</h2>
            <p>{introText}</p>
            <div style={{display:'grid', gap:10, margin:'18px 0'}}>
              <button className="neon-button" disabled={venueDisabled} onClick={startQrScanner} style={{width:'100%'}}>{venueBusy?'Verifying…': checkedIn?'Scan QR to Check Out':'Scan QR to Check In'}<span>→</span></button>
            </div>
            {showQrScanner && <div style={{border:'1px solid #2a3b44', borderRadius:12, overflow:'hidden', background:'#070c10', padding:8}}><video ref={qrVideoRef} muted playsInline style={{width:'100%', maxHeight:260, borderRadius:8, background:'#000'}}/><div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8}}><small style={{color:'#8aa0ad'}}>Point at QR on wall/projector</small><button className="ghost" onClick={()=>{stopQrScanner(); setShowQrScanner(false)}}>Close</button></div></div>}
          </div>
        </section>
      ) : stage === 'scanning' ? (
        <section className="face-id-shell stage-scanning">
          <div className="face-id-orb" style={{['--scan-progress' as any]: `${progress * 3.6}deg`}}><div className="scan-success-mark" style={{fontSize:36}}>◈</div></div>
          <div className="face-id-copy"><p className="scan-kicker pulse-text">QR VERIFICATION</p><h2>{instruction}</h2><div className="face-signal"><i/><span>{scanStatus}</span></div><div className="scan-progress-head"><span>Verifying QR</span><b>{progress}%</b></div><div className="scan-progress"><i style={{width:`${progress}%`}}/></div><small>QR + GPS only — no face scan.</small></div>
        </section>
      ) : stage === 'success' ? (
        <section className="face-id-shell stage-success">
          <div className="scan-success-mark">✓</div>
          <div className="face-id-copy"><p className="scan-kicker success-label">DONE</p><h2>{record?.status==='CHECKED_OUT'?'Checked out!':'You are in!'}</h2><p>Location + QR verified. Attendance recorded.</p><div className="scan-details">{[{label:'Student',value:summary?.fullName||'Student'},{label:'Student ID',value:summary?.registrationNumber||'—'},{label:'Time',value:record?.checkOutAt?formatCampusTime(record.checkOutAt):record?.checkInAt?formatCampusTime(record.checkInAt):'—'},{label:'Status',value:record?.status||'Verified'},{label:'Method',value:'QR Scan'}].map(d=> <div key={d.label}><span>{d.label}</span><b>{d.value}</b></div>)}</div><button className="neon-button" onClick={reset}>Continue<span>→</span></button></div>
        </section>
      ) : (
        <section className="face-id-shell stage-error">
          <div className="scan-error-mark">!</div>
          <div className="face-id-copy"><p className="scan-kicker error-label">FAILED</p><h2>{checkedIn?'Check-out unsuccessful':'Check-in unsuccessful'}</h2><p>{error || 'Could not verify QR. Please try again.'}</p><button className="retry-button" onClick={reset}>Try Again</button></div>
        </section>
      )
    ) : (
      <>
        {!enrolled && stage==='intro' && <div className="error" style={{marginBottom:12}}>Face ID not enrolled — <Link to="/student/face-enrollment">enrol now</Link> to use Face lane, or switch to Venue Code (works immediately).</div>}
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
          successTitle={record?.status==='CHECKED_OUT'?'Checked out!':'You are in!'}
          successText="Your live face matched the encrypted profile successfully."
          details={[
            {label:'Student',value:summary?.fullName||'Student'},
            {label:'Student ID',value:summary?.registrationNumber||'—'},
            {label:'Face ID',value:record?.faceId?`${record.faceId.slice(0,8)}…`:'—'},
            {label:'Time',value:record?.checkOutAt?formatCampusTime(record.checkOutAt):record?.checkInAt?formatCampusTime(record.checkInAt):'—'},
            {label:'Status',value:record?.status||'Verified'},
          ]}
          disabled={!session || scheduleLocked || !enrolled}
          onStart={scanFace}
          onReset={reset}
        />
      </>
    )}</div>
  }
