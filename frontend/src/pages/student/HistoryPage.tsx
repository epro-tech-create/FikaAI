import { useEffect, useState } from 'react'
import { api } from '../../services/api'

type Period = 'weekly' | 'monthly' | 'daily'

export default function HistoryPage() {
  const [period, setPeriod] = useState<Period>('weekly')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    setLoading(true)
    setErr('')
    api.get(`/student/attendance/history?period=${period}`).then(r => setData(r.data)).catch(e => setErr(e?.response?.data?.error?.message || 'Failed')).finally(() => setLoading(false))
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
          {/* Calendar strip */}
          <section className="content-card" style={{ padding: 18, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 12px', fontSize:13, letterSpacing:1, color:'var(--blue)' }}>WEEK</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
              {['Mon','Tue','Wed','Thu','Fri'].map(d => {
                const val = personal?.days?.[d] || '—'
                const color = val==='Present' ? '#0ea5e9' : val==='Late' ? '#f59e0b' : 'var(--line)'
                return (
                  <div key={d} style={{ padding:12, borderRadius:12, border:`1px solid ${val==='—'?'var(--line)':color}`, background: val==='—'?'var(--panel)':'color-mix(in srgb, '+color+' 12%, var(--panel))', textAlign:'center' }}>
                    <small style={{color:'var(--muted)',fontSize:10}}>{d}</small><br/><b style={{fontSize:11}}>{val}</b>
                  </div>
                )
              })}
            </div>
            {data.title && <small style={{color:'var(--muted)',display:'block',marginTop:10}}>{data.title}</small>}
          </section>

          <section className="content-card" style={{ padding: 16 }}>
            <h3 style={{ margin:'0 0 10px' }}>Recent records</h3>
            {data.rows?.length ? (
              <div style={{ display:'grid', gap:8 }}>
                {data.rows.slice(0,10).map((r:any) => (
                  <div key={r.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', border:'1px solid var(--line)', borderRadius:10, background:'var(--panel-2)' }}>
                    <span style={{fontSize:12}}>{r.date} · {r.day}</span>
                    <span className={`status-pill ${r.status==='PRESENT'?'':'inactive'}`} style={{ borderColor: r.status==='LATE'?'#f59e0b':undefined }}>{r.status}</span>
                  </div>
                ))}
              </div>
            ) : <p style={{color:'var(--muted)',fontSize:13}}>No records yet.</p>}
          </section>
        </>
      )}
    </div>
  )
}
