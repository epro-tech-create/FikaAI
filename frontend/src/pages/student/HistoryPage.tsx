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
