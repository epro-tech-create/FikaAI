import { useEffect, useState } from 'react'
import { api, message } from '../../services/api'
import { PageHeading, StatePanel } from '../../components/PortalUI'
import type { Role } from '../../lib/auth'

type Student = { id:string; fullName:string; membershipId?:string; registrationNumber:string; email:string }
type Session = { id:string; session_date:string; title:string; status:string; sessionDate?:string }

export default function ManualAttendancePage({ role }: { role: Extract<Role,'admin'|'instructor'> }) {
  const [students,setStudents]=useState<Student[]>([])
  const [sessions,setSessions]=useState<Session[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [ok,setOk]=useState('')
  // form state
  const [studentId,setStudentId]=useState('')
  const [sessionId,setSessionId]=useState('')
  const [status,setStatus]=useState('PRESENT')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  // excuse
  const [excuseRecordId,setExcuseRecordId]=useState('')
  const [excuseReason,setExcuseReason]=useState('')

  useEffect(()=>{
    async function load(){
      setLoading(true); setError('')
      try{
        const [sRes, sessRes]=await Promise.all([
          api.get(`/${role}/students`),
          api.get(`/${role}/sessions`),
        ])
        const sData = Array.isArray(sRes.data) ? sRes.data : []
        const sessData = Array.isArray(sessRes.data) ? sessRes.data : []
        setStudents(sData.map((x:any)=>({id:String(x.id), fullName:x.fullName||x.full_name||x.studentName, membershipId:x.membershipId, registrationNumber:x.registrationNumber||x.registration_number, email:x.email})))
        setSessions(sessData.map((x:any)=>({id:String(x.id), session_date:x.sessionDate||x.session_date||x.date, title:x.title||x.sessionTitle, status:x.status})))
        if(sessData.length) setSessionId(String(sessData[0].id))
      }catch(e){ setError(message(e)) } finally{ setLoading(false)}
    }
    void load()
  },[role])

  async function doCheckIn(){
    if(!studentId||!sessionId) return setError('Pick student and session')
    setBusy(true); setError(''); setOk('')
    try{
      const res = await api.post(`/${role}/attendance/manual-check-in`, { studentId, sessionId, status, reason: status==='EXCUSED'?reason:undefined })
      setOk(`Checked in: ${res.data?.status||status} ${res.data?.checkInAt||''}`)
    }catch(e){ setError(message(e)) } finally{ setBusy(false)}
  }
  async function doCheckOut(){
    if(!studentId||!sessionId) return setError('Pick student and session')
    setBusy(true); setError(''); setOk('')
    try{
      const res = await api.post(`/${role}/attendance/manual-check-out`, { studentId, sessionId })
      setOk(`Checked out: ${res.data?.checkOutAt||'ok'}`)
    }catch(e){ setError(message(e)) } finally{ setBusy(false)}
  }
  async function doExcuse(){
    setBusy(true); setError(''); setOk('')
    try{
      let recId = excuseRecordId.trim()
      if(!recId && studentId && sessionId){
        // find record via attendance list
        const att = await api.get(`/${role}/attendance`)
        const rows = Array.isArray(att.data)? att.data : []
        const found = rows.find((r:any)=> String(r.studentId)===studentId && String(r.sessionId)===sessionId)
        if(!found) throw new Error('No attendance record for that student+session. Check-in first or create ABSENT then excuse.')
        recId = String(found.id)
      }
      if(!recId) throw new Error('Provide record ID or pick student+session with existing record')
      if(!excuseReason.trim()) throw new Error('Provide reason: e.g. sickness, funeral of dad/mom')
      const res = await api.post(`/${role}/attendance/${recId}/excuse`, { reason: excuseReason, status:'EXCUSED' })
      setOk(`Excused: ${res.data?.status} - ${res.data?.excuseReason||excuseReason}`)
    }catch(e){ setError(message(e)) } finally{ setBusy(false)}
  }
  async function clearExcuse(){
    if(!excuseRecordId.trim()) return setError('Provide record ID to clear')
    setBusy(true); setError(''); setOk('')
    try{
      const res = await api.delete(`/${role}/attendance/${excuseRecordId.trim()}/excuse`)
      setOk(`Cleared: now ${res.data?.status}`)
    }catch(e){ setError(message(e)) } finally{ setBusy(false)}
  }

  if(loading) return <main className="portal-content"><StatePanel kind="loading"/></main>
  return <main className="portal-content">
    <PageHeading eyebrow="MANUAL OVERRIDE" title="Manual Attendance" description="Instructor/Admin can check-in or check-out any student without face/venue, and set excused reasons (sickness, funeral etc)." />
    {error ? <StatePanel kind="error">{error}</StatePanel> : null}
    {ok.trim() ? <div style={{background:'#ecfdf5',border:'1px solid #a7f3d0',padding:12,borderRadius:8,marginBottom:12,color:'#065f46'}}>{ok}</div> : null}
    <section className="content-card" style={{marginBottom:16, padding:20, overflow:'visible'}}>
      <h4 style={{margin:'0 0 14px',color:'#f1f5f9', lineHeight:1.4}}>Pick student & session</h4>
      <div style={{display:'grid',gap:14,gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))'}}>
        <label style={{color:'#cbd5e1',fontSize:13, display:'grid', gap:6}}>Student ({students.length})
          <select value={studentId} onChange={e=>setStudentId(e.target.value)} style={{width:'100%',padding:'11px 10px',borderRadius:8,background:'#0f172a',color:'#f1f5f9',border:'1px solid #334155', minWidth:0}}>
            <option value="">-- pick --</option>
            {students.map(s=><option key={s.id} value={s.id}>{s.fullName} — {s.registrationNumber} {s.membershipId?`(${s.membershipId})`:''}</option>)}
          </select>
        </label>
        <label style={{color:'#cbd5e1',fontSize:13, display:'grid', gap:6}}>Session ({sessions.length})
          <select value={sessionId} onChange={e=>setSessionId(e.target.value)} style={{width:'100%',padding:'11px 10px',borderRadius:8,background:'#0f172a',color:'#f1f5f9',border:'1px solid #334155', minWidth:0}}>
            <option value="">-- pick --</option>
            {sessions.map(s=><option key={s.id} value={s.id}>{s.session_date||'—'} — {s.title} ({s.status})</option>)}
          </select>
        </label>
      </div>
      <div style={{marginTop:16,display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
        <label style={{color:'#cbd5e1',fontSize:13, display:'grid', gap:6}}>Status
          <select value={status} onChange={e=>setStatus(e.target.value)} style={{padding:'11px 10px',minWidth:220,borderRadius:8,background:'#0f172a',color:'#f1f5f9',border:'1px solid #334155'}}>
            <option value="PRESENT">PRESENT (arrived early)</option>
            <option value="LATE">LATE</option>
            <option value="ABSENT">ABSENT (never came, shows —)</option>
            <option value="EXCUSED">EXCUSED (sickness/funeral)</option>
          </select>
        </label>
        {status==='EXCUSED' && <label style={{flex:1,color:'#cbd5e1',fontSize:13, display:'grid', gap:6}}>Reason (sickness, funeral of dad/mom...)<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. sickness, funeral" style={{width:'100%',padding:'11px 10px',borderRadius:8,background:'#0f172a',color:'#f1f5f9',border:'1px solid #334155'}}/></label>}
      </div>
      <div style={{marginTop:16,display:'flex',gap:10, flexWrap:'wrap'}}>
        <button disabled={busy} onClick={doCheckIn} className="portal-primary">Manual Check-in</button>
        <button disabled={busy} onClick={doCheckOut} className="secondary-button">Manual Check-out</button>
      </div>
      <small style={{color:'#94a3b8',marginTop:10,display:'block', lineHeight:1.5}}>Uses POST /{role}/attendance/manual-check-in and manual-check-out with MANUAL verification.</small>
    </section>
    <section className="content-card" style={{padding:20, overflow:'visible'}}>
      <h4 style={{margin:'0 0 8px',color:'#f1f5f9', lineHeight:1.4}}>Excuse / acceptable reason</h4>
      <p style={{color:'#cbd5e1',fontSize:13,lineHeight:1.7, marginBottom:14}}>Mark an existing record as EXCUSED with reason (sickness, funeral etc). Or clear excuse to revert to PRESENT.</p>
      <label style={{color:'#cbd5e1',fontSize:13, display:'grid', gap:6}}>Record ID (or leave blank to auto-find via student+session above)
        <input value={excuseRecordId} onChange={e=>setExcuseRecordId(e.target.value)} placeholder="uuid of attendance record" style={{width:'100%',padding:'11px 10px',borderRadius:8,background:'#0f172a',color:'#f1f5f9',border:'1px solid #334155'}}/>
      </label>
      <label style={{display:'grid',gap:6,marginTop:12,color:'#cbd5e1',fontSize:13}}>Reason
        <input value={excuseReason} onChange={e=>setExcuseReason(e.target.value)} placeholder="e.g. sickness, mother funeral" style={{width:'100%',padding:'11px 10px',borderRadius:8,background:'#0f172a',color:'#f1f5f9',border:'1px solid #334155'}}/>
      </label>
      <div style={{marginTop:16,display:'flex',gap:10, flexWrap:'wrap'}}>
        <button disabled={busy} onClick={doExcuse} className="portal-primary">Set EXCUSED</button>
        <button disabled={busy} onClick={clearExcuse} className="secondary-button">Clear excuse</button>
      </div>
    </section>
  </main>
}
