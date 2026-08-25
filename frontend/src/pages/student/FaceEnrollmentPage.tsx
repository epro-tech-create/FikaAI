import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import FaceScanFlow, { type ScanStage } from '../../components/FaceScanFlow'
import { api, message } from '../../services/api'
import { useCameraFrames } from '../../hooks/useCameraFrames'
import { useFaceMonitor, type FaceReading } from '../../hooks/useFaceMonitor'

const sleep = (milliseconds:number) => new Promise(resolve => window.setTimeout(resolve,milliseconds))

export default function FaceEnrollmentPage() {
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
    const poses = [
      { instruction:'Look straight at the camera', status:'Hold a straight pose', matches:(face:FaceReading) => Math.abs(face.yaw) <= 0.09 },
      { instruction:'Slowly turn your head to the left', status:'Hold your left profile', matches:(face:FaceReading) => face.yaw <= -0.12 },
      { instruction:'Slowly turn your head to the right', status:'Hold your right profile', matches:(face:FaceReading) => face.yaw >= 0.12 },
      { instruction:'Lower your chin slightly', status:'Hold the downward angle', matches:(face:FaceReading) => Math.abs(face.yaw) <= 0.12 && Math.abs(face.pitch - baselinePitch) >= 8 },
      { instruction:'Return and look straight again', status:'Hold the final straight pose', matches:(face:FaceReading) => Math.abs(face.yaw) <= 0.09 && Math.abs(face.pitch - baselinePitch) <= 7 },
    ]

    for (let index=0; index<poses.length; index++) {
      const pose = poses[index]
      const deadline = Date.now() + 30000
      let heldFrom = 0
      setInstruction(pose.instruction)
      while (Date.now() < deadline && runId.current === activeRun) {
        const face = monitor.current.current
        const matches = face.ready && pose.matches(face)
        if (!face.ready) setScanStatus(face.hint)
        else setScanStatus(matches ? `${pose.status} — keep still` : pose.status)

        if (matches) {
          if (!heldFrom) heldFrom = Date.now()
          const held = Date.now() - heldFrom
          setProgress(7 + index * 13 + Math.min(13,Math.round(held / 1000 * 13)))
          if (held >= 1000) {
            const sample = cam.grabFrame()
            samples.push(sample)
            if (index === 0) { baselinePitch = face.pitch; setSnapshot(sample) }
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
      if (samples.length !== index + 1) throw new Error(`The ${pose.instruction.toLowerCase()} pose was not captured in time. Please try again.`)
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
    <header><div className="brand">Fika<span>AI</span></div><nav><Link to="/student/attendance">Attendance</Link><Link to="/student/face-enrollment">Face enrolment</Link><button className="ghost" onClick={() => { localStorage.clear(); window.location.reload() }}>Sign out</button></nav></header>
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
      successText="Your normalized facial profile is encrypted and ready for attendance authentication."
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
    />
  </main>
}
