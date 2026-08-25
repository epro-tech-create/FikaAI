import type { RefObject } from 'react'

export type ScanStage = 'intro' | 'scanning' | 'success' | 'error'

type Detail = { label: string; value: string }

type Props = {
  stage: ScanStage
  videoRef: RefObject<HTMLVideoElement | null>
  progress: number
  instruction: string
  scanStatus?: string
  faceLocked?: boolean
  snapshot?: string
  error?: string
  introTitle: string
  introText: string
  actionLabel: string
  successTitle: string
  successText: string
  details?: Detail[]
  disabled?: boolean
  successLabel?: string
  onStart: () => void
  onReset: () => void
  onSuccess?: () => void
}

function FaceMesh() {
  return <svg className="face-mesh" viewBox="0 0 220 270" aria-hidden="true">
    <path d="M110 12C61 12 34 57 37 119c3 61 35 129 73 139 38-10 70-78 73-139 3-62-24-107-73-107Z"/>
    <path d="M110 12v246M38 109l72-97 72 97M47 168l63 90 63-90M55 62l55 45 55-45M37 119l73-12 73 12M47 168l63-61 63 61M68 205l42-98 42 98M55 62l-18 57 10 49 21 37 42 53 42-53 21-37 10-49-18-57-55-50-55 50Z"/>
    <path d="M74 112l20-9 16 4-16 16-20-11Zm72 0-20-9-16 4 16 16 20-11ZM88 163l22-13 22 13-22 13-22-13Z"/>
    {[['110','12'],['55','62'],['165','62'],['37','119'],['183','119'],['47','168'],['173','168'],['68','205'],['152','205'],['110','258'],['74','112'],['146','112'],['110','107'],['88','163'],['132','163']].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3"/>)}
  </svg>
}

export default function FaceScanFlow(props: Props) {
  const progress = Math.max(0, Math.min(100, Math.round(props.progress)))
  return <section className={`face-id-shell stage-${props.stage}`}>
    <div className="face-id-orb" style={{ '--scan-progress': `${progress * 3.6}deg` } as React.CSSProperties}>
      {props.stage === 'intro' && <FaceMesh/>}
      {(props.stage === 'scanning') && <video ref={props.videoRef} muted playsInline/>}
      {(props.stage === 'success') && props.snapshot && <img src={props.snapshot} alt="Verified student"/>}
      {(props.stage === 'error') && <div className="scan-error-mark">!</div>}
      {props.stage === 'scanning' && <><div className={`face-target ${props.faceLocked ? 'locked' : ''}`}/><div className="scan-beam"/></>}
    </div>

    {props.stage === 'intro' && <div className="face-id-copy"><p className="scan-kicker">SECURE FACE ID</p><h2>{props.introTitle}</h2><p>{props.introText}</p><button className="neon-button" disabled={props.disabled} onClick={props.onStart}>{props.actionLabel}<span>→</span></button></div>}

    {props.stage === 'scanning' && <div className="face-id-copy"><p className="scan-kicker pulse-text">LIVE AUTHENTICATION</p><h2>{props.instruction || 'Please wait…'}</h2><div className={`face-signal ${props.faceLocked ? 'locked' : ''}`}><i/>{props.scanStatus || 'Starting face scanner…'}</div><div className="scan-progress-head"><span>Scanning biometric profile</span><b>{progress}%</b></div><div className="scan-progress"><i style={{ width: `${progress}%` }}/></div><small>Progress only advances when your face and requested action are detected.</small></div>}

    {props.stage === 'success' && <div className="face-id-copy"><p className="scan-kicker success-label">AUTHENTICATION DONE</p><h2>{props.successTitle}</h2><p>{props.successText}</p>{props.details?.length ? <div className="scan-details">{props.details.map(detail => <div key={detail.label}><span>{detail.label}</span><b>{detail.value}</b></div>)}</div> : null}<button className="neon-button" onClick={props.onSuccess ?? props.onReset}>{props.successLabel || 'Continue'}<span>→</span></button></div>}

    {props.stage === 'error' && <div className="face-id-copy"><p className="scan-kicker error-label">AUTHENTICATION FAILED</p><h2>Face scan unsuccessful</h2><p>{props.error || 'We could not verify this scan. Please try again.'}</p><button className="retry-button" onClick={props.onReset}>Try Again</button></div>}
  </section>
}
