import { useEffect, useState, type CSSProperties } from 'react'
import { api, message } from '../../services/api'
import { PageHeading, StatePanel } from '../../components/PortalUI'
import type { Role } from '../../lib/auth'
import { CAMPUS_TIME_ZONE } from '../../lib/campusTime'

type Student = { id:string; fullName:string; membershipId?:string; registrationNumber:string; email:string }
type Session = {
  id:string
  session_date:string
  title:string
  status:string
  checkInOpen?:string
  officialStart?:string
  checkInClose?:string
  expectedEnd?:string
  checkOutClose?:string
}

const fieldStyle: CSSProperties = {width:'100%',padding:'11px 10px',borderRadius:8,background:'#0f172a',color:'#f1f5f9',border:'1px solid #334155', minWidth:0, colorScheme:'dark'}
const labelStyle: CSSProperties = {color:'#cbd5e1',fontSize:13, display:'grid', gap:6}

function toCampusIso(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length === 16 ? `${trimmed}:00` : trimmed
}

function toTimeInput(value?: string) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function formatSaved(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', { timeZone: CAMPUS_TIME_ZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

function mapSession(x: any): Session {
  return {
    id: String(x.id),
    session_date: x.sessionDate || x.session_date || x.date,
    title: x.title || x.sessionTitle,
    status: x.status,
    checkInOpen: x.checkInOpen || x.check_in_open,
    officialStart: x.officialStart || x.official_start,
    checkInClose: x.checkInClose || x.check_in_close,
    expectedEnd: x.expectedEnd || x.expected_end,
    checkOutClose: x.checkOutClose || x.check_out_close,
  }
}

export default function ManualAttendancePage({ role }: { role: Extract<Role,'admin'|'instructor'> }) {
  const [students,setStudents]=useState<Student[]>([])
  const [sessions,setSessions]=useState<Session[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [ok,setOk]=useState('')
  const [studentId,setStudentId]=useState('')
  const [sessionId,setSessionId]=useState('')
  const [status,setStatus]=useState('PRESENT')
  const [reason,setReason]=useState('')
  const [checkInAt,setCheckInAt]=useState('')
  const [checkOutAt,setCheckOutAt]=useState('')
  const [checkInOpen,setCheckInOpen]=useState('08:00')
  const [officialStart,setOfficialStart]=useState('09:30')
  const [checkInClose,setCheckInClose]=useState('15:00')
  const [expectedEnd,setExpectedEnd]=useState('15:00')
  const [checkOutClose,setCheckOutClose]=useState('17:00')
  const [busy,setBusy]=useState(false)
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
        const mapped = sessData.map(mapSession)
        setStudents(sData.map((x:any)=>({id:String(x.id), fullName:x.fullName||x.full_name||x.studentName, membershipId:x.membershipId, registrationNumber:x.registrationNumber||x.registration_number, email:x.email})))
        setSessions(mapped)
        if(mapped.length) setSessionId(String(mapped[0].id))
      }catch(e){ setError(message(e)) } finally{ setLoading(false)}
    }
    void load()
  },[role])

  useEffect(()=>{
    const selected = sessions.find(s => s.id === sessionId)
    if (!selected) return
    setCheckInOpen(toTimeInput(selected.checkInOpen) || '08:00')
    setOfficialStart(toTimeInput(selected.officialStart) || '09:30')
    setCheckInClose(toTimeInput(selected.checkInClose) || '15:00')
    setExpectedEnd(toTimeInput(selected.expectedEnd) || '15:00')
    setCheckOutClose(toTimeInput(selected.checkOutClose) || '17:00')
  }, [sessionId, sessions])

  async function saveHours(){
    if(!sessionId) return setError('Pick a session first')
    setBusy(true); setError(''); setOk('')
    try{
      const res = await api.patch(`/${role}/sessions/${sessionId}`, {
        checkInOpen,
        officialStart,
        checkInClose,
        expectedEnd,
        checkOutClose,
      })
      const updated = mapSession(res.data)
      setSessions(list => list.map(s => s.id === updated.id ? { ...s, ...updated } : s))
      setOk(`Session hours saved: check-in ${toTimeInput(updated.checkInOpen)}–${toTimeInput(updated.checkInClose)}, checkout ${toTimeInput(updated.expectedEnd)}–${toTimeInput(updated.checkOutClose)}`)
    }catch(e){ setError(message(e)) } finally{ setBusy(false)}
  }

  async function doCheckIn(){
    if(!studentId||!sessionId) return setError('Pick student and session')
    setBusy(true); setError(''); setOk('')
    try{
      const res = await api.post(`/${role}/attendance/manual-check-in`, {
        studentId,
        sessionId,
        status,
        reason: status==='EXCUSED'?reason:undefined,
        checkInAt: toCampusIso(checkInAt),
        checkOutAt: toCampusIso(checkOutAt),
      })
      setOk(`Checked in: ${res.data?.status||status} · in ${formatSaved(res.data?.checkInAt)}${res.data?.checkOutAt ? ` · out ${formatSaved(res.data.checkOutAt)}` : ''}`)
    }catch(e){ setError(message(e)) } finally{ setBusy(false)}
  }
  async function doCheckOut(){
    if(!studentId||!sessionId) return setError('Pick student and session')
    setBusy(true); setError(''); setOk('')
    try{
      const res = await api.post(`/${role}/attendance/manual-check-out`, {
        studentId,
        sessionId,
        checkOutAt: toCampusIso(checkOutAt),
      })
      setOk(`Checked out: ${formatSaved(res.data?.checkOutAt)||'ok'}`)
    }catch(e){ setError(message(e)) } finally{ setBusy(false)}
  }
  async function doExcuse(){
    setBusy(true); setError(''); setOk('')
    try{
      let recId = excuseRecordId.trim()
      if(!recId && studentId && sessionId){
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
    <PageHeading eyebrow="MANUAL OVERRIDE" title="Manual Attendance" description="Change today’s check-in / checkout windows, or write a student’s arrival and departure times by hand." />
    {error ? <StatePanel kind="error">{error}</StatePanel> : null}
    {ok.trim() ? <div style={{background:'#ecfdf5',border:'1px solid #a7f3d0',padding:12,borderRadius:8,marginBottom:12,color:'#065f46'}}>{ok}</div> : null}

    <section className="content-card" style={{marginBottom:16, padding:20, overflow:'visible'}}>
      <h4 style={{margin:'0 0 8px',color:'#f1f5f9', lineHeight:1.4}}>Session hours</h4>
      <p style={{color:'#cbd5e1',fontSize:13,lineHeight:1.6, margin:'0 0 14px'}}>This is the 08:00–15:00 / 15:00–17:00 window students see. Edit it here and save — it stays until you change it again.</p>
      <label style={{...labelStyle, marginBottom:14}}>Session
        <select value={sessionId} onChange={e=>setSessionId(e.target.value)} style={fieldStyle}>
          <option value="">-- pick --</option>
          {sessions.map(s=><option key={s.id} value={s.id}>{s.session_date||'—'} — {s.title} ({s.status})</option>)}
        </select>
      </label>
      <div style={{display:'grid',gap:14,gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))'}}>
        <label style={labelStyle}>Check-in opens<input type="time" value={checkInOpen} onChange={e=>setCheckInOpen(e.target.value)} style={fieldStyle}/></label>
        <label style={labelStyle}>Late after<input type="time" value={officialStart} onChange={e=>setOfficialStart(e.target.value)} style={fieldStyle}/></label>
        <label style={labelStyle}>Check-in closes<input type="time" value={checkInClose} onChange={e=>setCheckInClose(e.target.value)} style={fieldStyle}/></label>
        <label style={labelStyle}>Checkout opens<input type="time" value={expectedEnd} onChange={e=>setExpectedEnd(e.target.value)} style={fieldStyle}/></label>
        <label style={labelStyle}>Checkout closes<input type="time" value={checkOutClose} onChange={e=>setCheckOutClose(e.target.value)} style={fieldStyle}/></label>
      </div>
      <div style={{marginTop:16}}>
        <button disabled={busy} onClick={saveHours} className="portal-primary">Save session hours</button>
      </div>
    </section>

    <section className="content-card" style={{marginBottom:16, padding:20, overflow:'visible'}}>
      <h4 style={{margin:'0 0 14px',color:'#f1f5f9', lineHeight:1.4}}>One student — set times</h4>
      <div style={{display:'grid',gap:14,gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))'}}>
        <label style={labelStyle}>Student ({students.length})
          <select value={studentId} onChange={e=>setStudentId(e.target.value)} style={fieldStyle}>
            <option value="">-- pick --</option>
            {students.map(s=><option key={s.id} value={s.id}>{s.fullName} — {s.registrationNumber} {s.membershipId?`(${s.membershipId})`:''}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Check-in time (optional)
          <input type="datetime-local" value={checkInAt} onChange={e=>setCheckInAt(e.target.value)} style={fieldStyle} />
        </label>
        <label style={labelStyle}>Check-out time (optional)
          <input type="datetime-local" value={checkOutAt} onChange={e=>setCheckOutAt(e.target.value)} style={fieldStyle} />
        </label>
      </div>
      <div style={{marginTop:16,display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
        <label style={{...labelStyle, minWidth:220}}>Status
          <select value={status} onChange={e=>setStatus(e.target.value)} style={fieldStyle}>
            <option value="PRESENT">PRESENT (arrived early)</option>
            <option value="LATE">LATE</option>
            <option value="ABSENT">ABSENT (never came, shows —)</option>
            <option value="EXCUSED">EXCUSED (sickness/funeral)</option>
          </select>
        </label>
        {status==='EXCUSED' && <label style={{flex:1,...labelStyle}}>Reason (sickness, funeral of dad/mom...)<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. sickness, funeral" style={fieldStyle}/></label>}
      </div>
      <div style={{marginTop:16,display:'flex',gap:10, flexWrap:'wrap'}}>
        <button disabled={busy} onClick={doCheckIn} className="portal-primary">Save check-in</button>
        <button disabled={busy} onClick={doCheckOut} className="secondary-button">Save check-out</button>
      </div>
      <small style={{color:'#94a3b8',marginTop:10,display:'block', lineHeight:1.5}}>Per-student times ignore the 08:00–15:00 window. Leave a field empty to use now. Fill both, then Save check-in, to record arrival and departure together.</small>
    </section>
    <section className="content-card" style={{padding:20, overflow:'visible'}}>
      <h4 style={{margin:'0 0 8px',color:'#f1f5f9', lineHeight:1.4}}>Excuse / acceptable reason</h4>
      <p style={{color:'#cbd5e1',fontSize:13,lineHeight:1.7, marginBottom:14}}>Mark an existing record as EXCUSED with reason (sickness, funeral etc). Or clear excuse to revert to PRESENT.</p>
      <label style={labelStyle}>Record ID (or leave blank to auto-find via student+session above)
        <input value={excuseRecordId} onChange={e=>setExcuseRecordId(e.target.value)} placeholder="uuid of attendance record" style={fieldStyle}/>
      </label>
      <label style={{...labelStyle, marginTop:12}}>Reason
        <input value={excuseReason} onChange={e=>setExcuseReason(e.target.value)} placeholder="e.g. sickness, mother funeral" style={fieldStyle}/>
      </label>
      <div style={{marginTop:16,display:'flex',gap:10, flexWrap:'wrap'}}>
        <button disabled={busy} onClick={doExcuse} className="portal-primary">Set EXCUSED</button>
        <button disabled={busy} onClick={clearExcuse} className="secondary-button">Clear excuse</button>
      </div>
    </section>
  </main>
}
