import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FaceScanFlow, { type ScanStage } from '../../components/FaceScanFlow'
import { api, message } from '../../services/api'
import { useCameraFrames } from '../../hooks/useCameraFrames'
import { useFaceMonitor, type FaceReading } from '../../hooks/useFaceMonitor'
import { isContinuousReading, isFreshReading } from '../../lib/captureQuality'
import { clearAuthentication } from '../../lib/auth'

const sleep = (milliseconds:number) => new Promise(resolve => window.setTimeout(resolve,milliseconds))

export default function FaceEnrollmentPage() {
  const navigate = useNavigate()
  const [status,setStatus] = useState<any>()
  const [consent,setConsent] = useState(false)
  const [stage,setStage] = useState<ScanStage>('intro')
  const [progress,setProgress] = useState(0)
  const [instruction,setInstruction] = useState('')
  const [scanStatus,setScanStatus] = useState('Starting face scanner…')
  const [snapshot,setSnapshot] = useState('')
  const [error,setError] = useState('')
  const cam = useCameraFrames()
  const monitor = useFaceMonitor(cam.video)
  const runId = useRef(0)

  useEffect(() => {
    api.get('/student/face-enrollment/status').then(response => setStatus(response.data)).catch(requestError => setError(message(requestError)))
    return () => { runId.current += 1; monitor.stop(); cam.stop() }
  }, [])

  async function captureGuidedPoses(activeRun:number) {
    const samples:string[] = []
    let baselinePitch = 0
    let lastVideoTime = -1
    const poses = [
      { instruction:'Look straight at the camera', status:'Hold a straight pose', samples:2, matches:(face:FaceReading) => face.ready && Math.abs(face.yaw) <= 0.09 },
      { instruction:'Slowly turn your head to the left', status:'Hold your left profile', samples:1, matches:(face:FaceReading) => face.faceCount === 1 && face.sizeOk && face.lightingOk && face.yaw <= -0.12 },
      { instruction:'Slowly turn your head to the right', status:'Hold your right profile', samples:1, matches:(face:FaceReading) => face.faceCount === 1 && face.sizeOk && face.lightingOk && face.yaw >= 0.12 },
      { instruction:'Lower your chin slightly', status:'Hold the downward angle', samples:1, matches:(face:FaceReading) => face.ready && Math.abs(face.yaw) <= 0.12 && Math.abs(face.pitch - baselinePitch) >= 8 },
      { instruction:'Return and look straight again', status:'Hold the final straight pose', samples:2, matches:(face:FaceReading) => face.ready && Math.abs(face.yaw) <= 0.09 && Math.abs(face.pitch - baselinePitch) <= 7 },
    ]

    for (let index=0; index<poses.length; index++) {
      const pose = poses[index]
      const deadline = Date.now() + 30000
      let heldFrom = 0
      let lastSequence = monitor.current.current.sequence
      let previousAnalyzedAt = 0
      setInstruction(pose.instruction)
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
        const matches = pose.matches(face)
        if (!face.ready) setScanStatus(face.hint)
        else setScanStatus(matches ? `${pose.status} — keep still` : pose.status)

        if (matches) {
          if (!heldFrom) heldFrom = face.analyzedAt
          const held = face.analyzedAt - heldFrom
          setProgress(7 + index * 13 + Math.min(13,Math.round(held / 1000 * 13)))
          if (held >= 1000) {
            const sample = cam.grabFrame(lastVideoTime)
            lastVideoTime = sample.videoTime
            samples.push(sample.dataUrl)
            if (pose.samples === 2) {
              await sleep(180)
              const extra = cam.grabFrame(lastVideoTime)
              lastVideoTime = extra.videoTime
              samples.push(extra.dataUrl)
            }
            if (index === 0) { baselinePitch = face.pitch; setSnapshot(sample.dataUrl) }
            setScanStatus(`Pose ${index + 1} of ${poses.length} captured`)
            await sleep(500)
            break
          }
        } else {
          heldFrom = 0
          setProgress(7 + index * 13)
        }
        await sleep(70)
      }
      const completedSamples = poses.slice(0,index + 1).reduce((total,item) => total + item.samples,0)
      if (samples.length !== completedSamples) throw new Error(`The ${pose.instruction.toLowerCase()} pose was not captured in time. Please try again.`)
    }
    return samples
  }

  async function enroll() {
    const activeRun = ++runId.current
    setStage('scanning'); setProgress(2); setInstruction('Loading secure face scanner…'); setScanStatus('Allow camera access when asked'); setError('')
    let processingTimer: number | undefined
    try {
      await cam.start()
      await monitor.start()
      const samples = await captureGuidedPoses(activeRun)
      monitor.stop(); cam.stop(); setInstruction('Encrypting your Face ID…'); setScanStatus('Building your multi-angle biometric profile'); setProgress(72)
      processingTimer = window.setInterval(() => setProgress(value => Math.min(94,value + 1)),130)
      const response = await api.post('/student/face-enrollment',{samples,consentGranted:consent})
      window.clearInterval(processingTimer); processingTimer = undefined
      setStatus(response.data); setProgress(100)
      window.setTimeout(() => setStage('success'),350)
    } catch (requestError) {
      if (processingTimer) window.clearInterval(processingTimer)
      monitor.stop(); cam.stop(); setError(message(requestError)); setStage('error')
    }
  }

  function reset() { runId.current += 1; monitor.stop(); cam.stop(); setProgress(0); setInstruction(''); setError(''); setStage('intro') }

  return <main className="app">
    <header className="student-header"><Link className="brand" to="/">Fika<span>AI</span></Link><nav><Link to="/student/attendance">Attendance</Link><Link to="/student/face-enrollment">Face enrolment</Link><button className="ghost" onClick={() => { clearAuthentication(); window.location.href = '/login' }}>Sign out</button></nav></header>
    <section className="hero compact-hero"><p className="eyebrow">BIOMETRIC IDENTITY SETUP</p><h1>Create your secure Face ID</h1><p className="date">Five verified captures across front, left, right and downward angles generate one encrypted facial profile.</p></section>
    {stage === 'intro' && <label className="consent consent-dark"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span><b>Biometric consent</b>I consent to encrypted face-embedding storage for attendance verification.</span></label>}
    <FaceScanFlow
      stage={stage}
      videoRef={cam.video}
      progress={progress}
      instruction={instruction}
      scanStatus={scanStatus}
      faceLocked={monitor.reading.ready}
      snapshot={snapshot}
      error={error}
      introTitle={status?.enrolled ? 'Update your Face ID' : 'Enrol your Face ID'}
      introText="Position your full face in the scanner. Each front, left, right and downward pose must be detected and held before it is captured."
      actionLabel={status?.enrolled ? 'Ready to Re-enrol' : 'Ready to Enrol'}
      successTitle="Face ID created!"
      successText="Your normalized facial profile is encrypted and ready for attendance authentication. Continue to scan for check-in."
      successLabel="Continue to check-in"
      details={[
        {label:'Face ID',value:status?.faceId ? `${status.faceId.slice(0,8)}…` : 'Created'},
        {label:'Samples',value:String(status?.sampleCount || 5)},
        {label:'Provider',value:status?.provider === 'insightface_buffalo_l' ? 'ArcFace' : status?.provider || 'ArcFace'},
        {label:'Storage',value:'Encrypted'},
        {label:'Status',value:'Ready'},
      ]}
      disabled={!consent}
      onStart={enroll}
      onReset={reset}
      onSuccess={() => navigate('/student/attendance')}
    />
  </main>
}
