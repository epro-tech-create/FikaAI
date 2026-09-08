import { useEffect, useState } from 'react'
import { api } from '../../services/api'

type Period = 'weekly' | 'monthly' | 'daily'

export default function HistoryPage() {
  const [period, setPeriod] = useState<Period>('weekly')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [calendar, setCalendar] = useState<any[]>([])
  useEffect(() => {
    setLoading(true)
    setErr('')
    Promise.all([
      api.get(`/student/attendance/history?period=${period}`).then(r => r.data).catch(() => null),
      api.get(`/student/attendance/calendar?days=84`).then(r => r.data?.calendar || []).catch(() => []),
    ]).then(([h, cal]) => {
      if (h) setData(h)
      else setErr('Failed to load history')
      setCalendar(cal)
    }).finally(() => setLoading(false))
  }, [period])

  const personal = data?.personal

  return (
    <div>
      <div className="portal-heading"><div><p>HISTORY</p><h1>Your attendance</h1><span>Calendar, streak & weekly overview.</span></div></div>

      <div className="report-controls" style={{ marginBottom: 16 }}>
        <div className="report-period">
          {(['weekly','monthly','daily'] as Period[]).map(p => (
            <button key={p} className={period===p?'mode-btn active':'mode-btn'} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
        {personal && <span style={{color:'var(--muted)',fontSize:12}}>Present {personal.daysPresent} · Late {personal.lateDays}</span>}
      </div>

      {loading && <div className="state-panel loading"><i/><b>Loading history</b></div>}
      {err && <div className="error">{err}</div>}

      {data && !loading && (
        <>
          {/* Calendar - Habits dot grid (one dot = one day) */}
          <section className="content-card" style={{ padding: 18, marginBottom: 14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ margin:0, fontSize:13, letterSpacing:1, color:'var(--blue)' }}>WEEK</h3>
              <small style={{ color:'var(--muted)', fontSize:11 }}>{calendar.filter((c:any)=>c.dot==='blue').length} full · {calendar.filter((c:any)=>c.dot==='faded').length} partial of {calendar.length} days</small>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:14 }}>
              {['Mon','Tue','Wed','Thu','Fri'].map(d => {
                const val = personal?.days?.[d] || '—'
                const color = val==='Present' ? '#0ea5e9' : val==='Late' ? '#f59e0b' : 'var(--line)'
                return (
                  <div key={d} style={{ padding:10, borderRadius:10, border:`1px solid ${val==='—'?'var(--line)':color}`, background: val==='—'?'var(--panel)':'color-mix(in srgb, '+color+' 12%, var(--panel))', textAlign:'center' }}>
                    <small style={{color:'var(--muted)',fontSize:9}}>{d}</small><br/><b style={{fontSize:10}}>{val}</b>
                  </div>
                )
              })}
            </div>
            {/* Dot grid - responsive */}
            {calendar.length > 0 && (
              <div className="habit-grid" style={{ display:'grid', gridTemplateColumns:'repeat(12, 1fr)', gap:4 }}>
                {Array.from({ length:12 }).map((_, col) => (
                  <div key={col} className="habit-col" style={{ display:'grid', gap:4 }}>
                    {calendar.slice(col*7, col*7+7).map((d:any) => {
                      const style = d.dot==='blue' ? { background:'var(--blue)', borderColor:'var(--blue)' } : d.dot==='faded' ? { background:'color-mix(in srgb, var(--blue) 42%, transparent)', borderColor:'var(--blue)' } : { background:'transparent', borderColor:'var(--line)' }
                      return <div key={d.date} title={`${d.date} ${d.status||'—'}`} style={{ width:'100%', aspectRatio:'1', borderRadius:3, border:'1px solid', ...style }} />
                    })}
                  </div>
                ))}
              </div>
            )}
            {data.title && <small style={{color:'var(--muted)',display:'block',marginTop:10}}>{data.title} · One dot = one day · blue = in+out, faded = only in</small>}
            {!calendar.length && <p style={{color:'var(--muted)',fontSize:12, marginTop:10}}>No calendar data yet - check in to see dots.</p>}
          </section>

          <section className="content-card" style={{ padding: 16 }}>
            <h3 style={{ margin:'0 0 10px' }}>Recent records</h3>
            {(data.rows?.length || (data.studentRows?.length)) ? (
              <div style={{ display:'grid', gap:8 }}>
                {(data.studentRows || data.rows).slice(0,10).map((r:any) => (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:'1px solid var(--line)', borderRadius:10, background:'var(--panel-2)' }}>
                    <span style={{fontSize:12}}>{r.date} · {r.day}</span>
                    <span className={`status-pill ${r.status==='PRESENT'?'':'inactive'}`} style={{ borderColor: r.status==='LATE'?'#f59e0b':undefined }}>{r.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p style={{color:'var(--muted)',fontSize:13, marginBottom:8}}>No records for this {period}.</p>
                {calendar.filter((c:any)=>c.dot!=='none').length>0 && <p style={{color:'var(--muted)',fontSize:12}}>Showing {calendar.filter((c:any)=>c.dot!=='none').length} days with attendance in last 84 days above.</p>}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
