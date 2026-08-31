import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { PageHeading } from '../../components/PortalUI'

export default function VenueQrPage({ role }: { role: 'admin'|'instructor' }) {
  const [data,setData]=useState<any>(null)
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(true)
  const endpoint = role==='admin' ? '/admin/venue-qr' : '/instructor/venue-qr'
  useEffect(()=>{ (async()=>{
    try{ const r=await api.get(endpoint); setData(r.data) } catch(e:any){ setError(message(e)) } finally{ setBusy(false) }
  })()},[])
  if(busy) return <div className="state-panel"><p>Loading venue code…</p></div>
  if(error) return <div className="error">{error}</div>
  return <div>
    <PageHeading eyebrow="RAFIC VENUE PROOF" title="Venue Code & QR — Entire IPT" description="Static 8-char code displayed in the RAFIC room. Same code for check-in (08:00–14:00) and check-out (14:00–16:00) every day. GPS still required (100 m)."/>
    <div style={{display:'grid', gap:16, maxWidth:560, margin:'18px 0'}}>
      <div style={{padding:'18px', border:'1px solid #1e3a4a', borderRadius:14, background:'#0e1a22'}}>
        <small style={{letterSpacing:'1.2px', color:'#5a8aa0'}}>STATIC CODE (on poster/projector)</small>
        <div style={{font: '700 34px monospace', letterSpacing:'6px', textAlign:'center', margin:'14px 0', color:'#f2f7f8', background:'#070c10', padding:'14px', borderRadius:10, border:'1px dashed #2a4a5e'}}>VENUE CODE IN ROOM</div>
        <small style={{color:'#7ea0b5'}}>Actual 8-char code is on the physical poster/projector in RAFIC. This page shows only a hint for security: <b style={{color:'#cfe8f5'}}>{data?.codeHint ?? '****'}</b>. Generate/print QR via: <code>python backend/scripts/generate_venue_code.py --code YOUR8CHAR --qr</code> then display <code>venue-qr.png</code> on projector.</small>
      </div>
      <div style={{padding:'14px', border:'1px solid #2a3b44', borderRadius:10, background:'#0d151a', fontSize:13, color:'#9bb5c4', lineHeight:1.6}}>
        <b style={{color:'#cfe8f5'}}>How it works (automatic):</b><br/>
        1. Student taps <b>Scan QR / Check In</b> → app prompts “Allow location”.<br/>
        2. App auto-verifies location (inside 100 m RAFIC) + venue code — no extra taps.<br/>
        3. Same code works for check-out 14:00–16:00. After 16:00 session closes.<br/>
        <br/>
        <b style={{color:'#cfe8f5'}}>Setup:</b> Set <code>VENUE_STATIC_CODE_HASH</code> in <code>.env</code> / Render env (sha256 of 8-char). Example dev code <code>A7K9P2X4</code> already in <code>.env.example</code>. Print QR and pin at RAFIC entrance + projector slide.
      </div>
      {data?.message && <div style={{fontSize:12, color:'#6a8a9a'}}>{data.message}</div>}
    </div>
  </div>
}
