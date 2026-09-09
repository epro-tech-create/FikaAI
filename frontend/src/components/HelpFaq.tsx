import { useState } from 'react'
export default function HelpFaq() {
  const [open, setOpen] = useState<string | null>(null)
  const toggle = (k:string) => setOpen(open===k?null:k)
  const Item = ({k,q,a}:{k:string,q:string,a:string}) => (
    <div style={{ border:'1px solid var(--line)', borderRadius:10, overflow:'hidden' }}>
      <button onClick={()=>toggle(k)} style={{ width:'100%', textAlign:'left', padding:'12px 14px', background:'var(--panel)', border:0, color:'var(--text)', fontWeight:600, cursor:'pointer', display:'flex', justifyContent:'space-between' }}>
        {q} <span>{open===k?'−':'+'}</span>
      </button>
      {open===k && <div style={{ padding:'12px 14px', background:'var(--panel-2)', color:'var(--muted)', fontSize:13, lineHeight:1.6 }}>{a}</div>}
    </div>
  )
  return (
    <section className="content-card" style={{ padding:16 }}>
      <h3 style={{ margin:'0 0 12px' }}>Help · Troubleshooting</h3>
      <div style={{ display:'grid', gap:8 }}>
        <Item k="gps" q="GPS says outside RAFIC" a="Allow Precise Location on iPhone (Safari → AA → Website Settings → Location → Allow + Precise ON). Ensure inside 300 m of RAFIC, accuracy <400 m. Wait 5 seconds for GPS to lock. If 60 scan at once, wait 30s and retry — server now handles 120/min." />
        <Item k="early" q="Can't leave early / Check-out blocked until 15:00?" a="Fixed: check-out now opens at 11:00 (was 15:00). You can scan the same RAFIC QR to check out any time 11:00–17:00. If you see 'Checkout opens at 15:00', force-reload the page." />
        <Item k="cam" q="Camera blocked" a="Allow camera when asked. If blocked: browser settings → Site settings → Camera → Allow, then reload. Close other apps using camera." />
        <Item k="late" q="Why was I marked LATE?" a="Check-in before 09:30 = PRESENT (early). At 09:30 and after = LATE. Times are Africa/Dar_es_Salaam. Checkout 15:00–17:00 does not affect late." />
        <Item k="qr" q="QR not scanning / venue code failed" a="Scan the physical QR in RAFIC room with phone camera (not Face ID). The code is static for whole IPT. If invalid, ask instructor for current 8-char code." />
      </div>
    </section>
  )
}
