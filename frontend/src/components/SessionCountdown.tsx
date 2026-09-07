import { useCampusClock } from '../hooks/useCampusClock'

function toMin(t: string) { const [h,m]=t.split(':').map(Number); return h*60+m }
function campusMin(d: Date) {
  const h = Number(new Intl.DateTimeFormat('en-GB',{ timeZone:'Africa/Dar_es_Salaam', hour:'2-digit', hour12:false }).format(d))
  const m = Number(new Intl.DateTimeFormat('en-GB',{ timeZone:'Africa/Dar_es_Salaam', minute:'2-digit' }).format(d))
  return h*60+m
}
export default function SessionCountdown({ session }: { session:any }) {
  const clock = useCampusClock()
  if (!session) return null
  const now = campusMin(clock)
  const open = toMin(session.checkInOpen||'08:00')
  const cut = toMin(session.officialStart||'09:30')
  const close = toMin(session.checkInClose||'15:00')
  const outOpen = toMin(session.expectedEnd||session.checkoutOpensAt?.slice(11,16)||'15:00')
  const outClose = toMin(session.checkOutClose||'17:00')
  let state: string, color: string
  if (now < open) { state=`Opens at ${session.checkInOpen||'08:00'}`; color='#6b8590' }
  else if (now < cut) { state=`Early until 09:30 · ${cut-now} min left`; color='#0ea5e9' }
  else if (now < close) { state=`Late from 09:30 · Closes 15:00`; color='#f59e0b' }
  else if (now < outOpen) { state=`Check-in closed · Checkout 15:00`; color='#6b8590' }
  else if (now < outClose) { state=`Checkout open until 17:00`; color='#10b981' }
  else { state=`Closed for today`; color='#6b8590' }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:12, border:`1px solid ${color}30`, background:`color-mix(in srgb, ${color} 10%, var(--panel))`, color, fontSize:12, fontWeight:600 }}>
      <i style={{ width:8, height:8, borderRadius:'50%', background:color, boxShadow:`0 0 8px ${color}` }} />
      {state} <span style={{ marginLeft:'auto', opacity:.7 }}>{clock.toLocaleTimeString([], { timeZone:'Africa/Dar_es_Salaam', hour:'2-digit', minute:'2-digit' })}</span>
    </div>
  )
}
