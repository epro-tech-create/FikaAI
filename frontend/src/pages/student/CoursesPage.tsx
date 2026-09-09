import { useState } from 'react'

type Course = {
  code:string; title:string; desc:string; lessons:number; hours:string; level:string; color:string; image:string; progress?:number
}

const COURSES: Course[] = [
  { code:'IPT-101', title:'Cybersecurity Fundamentals', desc:'Master CIA triad, threat models and security hygiene — the foundation for RAFIC training.', lessons:8, hours:'12h', level:'Beginner', color:'#0ea5e9', image:'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=600&auto=format&fit=crop', progress:72 },
  { code:'IPT-102', title:'Network Security & RAFIC Lab', desc:'Hands-on with firewalls, VLANs and the 100m geofence network inside DIT.', lessons:10, hours:'16h', level:'Intermediate', color:'#6366f1', image:'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=600&auto=format&fit=crop', progress:34 },
  { code:'IPT-103', title:'Ethical Hacking & Pentest', desc:'Recon to reporting in the Cyber Range Lab — labs mirror real assessments.', lessons:12, hours:'20h', level:'Intermediate', color:'#ec4899', image:'https://images.unsplash.com/photo-1553877522-43269d4ea984?q=80&w=600&auto=format&fit=crop', progress:0 },
  { code:'IPT-104', title:'Digital Forensics', desc:'Evidence handling, chain of custody and forensic imaging for field stations.', lessons:6, hours:'10h', level:'Advanced', color:'#f59e0b', image:'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=600&auto=format&fit=crop', progress:0 },
  { code:'IPT-105', title:'Secure Software & Face ID Privacy', desc:'How encrypted embeddings, liveness and privacy-by-design protect you.', lessons:5, hours:'8h', level:'Advanced', color:'#10b981', image:'https://images.unsplash.com/photo-1526378800651-c32d170fe6f8?q=80&w=600&auto=format&fit=crop', progress:90 },
]

export default function CoursesPage(){
  const [filter,setFilter]=useState('All')
  const levels=['All','Beginner','Intermediate','Advanced']
  const filtered = filter==='All' ? COURSES : COURSES.filter(c=>c.level===filter)
  const [q,setQ]=useState('')
  const visible = q.trim() ? filtered.filter(c=> (c.title+c.desc).toLowerCase().includes(q.toLowerCase())) : filtered
  return <div>
    {/* hero - same blue as homepage Good morning banner */}
    <div style={{background:'linear-gradient(135deg,rgba(15,107,230,0.92) 0%,rgba(19,126,232,0.88) 35%,rgba(59,156,255,0.84) 68%,rgba(114,185,255,0.82) 100%), url("https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=1200&auto=format&fit=crop") center/cover no-repeat', borderRadius:20, padding:'24px 20px', color:'white', position:'relative', overflow:'hidden', marginBottom:16, border:'1px solid rgba(255,255,255,0.14)'}}>
      <div style={{position:'absolute', inset:0, background:'radial-gradient(520px 200px at 85% 0%, rgba(255,255,255,0.14), transparent 60%)'}}/>
      <div style={{position:'relative', display:'flex', flexWrap:'wrap', gap:16, alignItems:'flex-end', justifyContent:'space-between'}}>
        <div>
          <p style={{margin:0, fontSize:11, letterSpacing:1.4, fontWeight:700, opacity:.85}}>LEARNING · IPT 2026</p>
          <h1 style={{margin:'6px 0 8px', fontSize:'clamp(22px,3vw,28px)', fontWeight:700, letterSpacing:-.6, fontFamily:"'Space Grotesk', sans-serif"}}>Courses & materials</h1>
          <p style={{margin:0, fontSize:13, opacity:.85, maxWidth:560, lineHeight:1.6}}>Curated for RAFIC daily practicals — tap a course to continue. Your Face ID stays as a popup in Attendance → enrol now.</p>
        </div>
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <span style={{padding:'8px 12px', borderRadius:999, background:'rgba(255,255,255,0.14)', border:'1px solid rgba(255,255,255,0.18)', fontSize:12, fontWeight:600}}>{visible.length} courses</span>
        </div>
      </div>
      {/* search + filters */}
      <div style={{position:'relative', marginTop:16, display:'flex', gap:10, flexWrap:'wrap'}}>
        <div style={{flex:'1 1 220px', display:'flex', alignItems:'center', gap:8, background:'#ffffff', borderRadius:12, padding:'8px 12px', border:'1px solid #ffffff', boxShadow:'0 2px 10px rgba(15,23,42,0.08)'}}>
          <span style={{color:'#64748b', flex:'0 0 auto'}}>⌕</span>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search courses, topics" style={{flex:1, border:0, outline:'none', fontSize:13, color:'#0f172a', background:'#ffffff'}} />
        </div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {levels.map(l=> <button key={l} onClick={()=>setFilter(l)} style={{padding:'8px 14px', borderRadius:999, border:'1px solid rgba(255,255,255,0.22)', background: filter===l ? 'white' : 'rgba(255,255,255,0.12)', color: filter===l ? '#0f172a' : 'white', fontWeight:600, fontSize:12, cursor:'pointer'}}>{l}</button>)}
        </div>
      </div>
    </div>

    {/* grid */}
    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14}}>
      {visible.map(c=> <div key={c.code} className="content-card courses-card" style={{padding:0, overflow:'hidden', display:'flex', flexDirection:'column', borderRadius:16}}>
        <div style={{height:132, background:`linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.28)), url(${c.image}) center/cover`, position:'relative'}}>
          <span style={{position:'absolute', right:12, top:12, padding:'4px 8px', borderRadius:999, background:'rgba(15,23,42,0.88)', color:'white', fontSize:10, fontWeight:600}}>{c.level}</span>
          <span style={{position:'absolute', left:12, bottom:10, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,0.92)', color:'#0f172a', fontSize:11, fontWeight:600}}>{c.lessons} lessons · {c.hours}</span>
        </div>
        <div style={{padding:'14px 14px 12px', flex:1, display:'flex', flexDirection:'column', gap:8}}>
          <h3 style={{margin:0, fontWeight:700, fontSize:15, lineHeight:1.3, color:'var(--text)', fontFamily:"'Space Grotesk', sans-serif"}}>{c.title}</h3>
          <p style={{margin:0, fontSize:12, lineHeight:1.6, color:'var(--muted)', flex:1}}>{c.desc}</p>
          {(c.progress||0)>0 && <div style={{marginTop:6}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:4}}><span>Progress</span><span style={{color:c.color, fontWeight:700}}>{c.progress}%</span></div>
            <div style={{height:6, borderRadius:999, background:'var(--line)', overflow:'hidden'}}><i style={{display:'block', height:'100%', width:`${c.progress}%`, background:c.color, borderRadius:'inherit'}}/></div>
          </div>}
          <div style={{display:'flex', gap:8, marginTop:8}}>
            <button onClick={()=>alert('Course materials: '+c.title+' — ask instructor in Messages for access')} style={{flex:1, padding:'10px 12px', borderRadius:10, border:`1px solid ${c.color}`, background:c.color, color:'white', fontWeight:700, fontSize:12, cursor:'pointer'}}>Continue</button>
            <button onClick={()=>alert('Added to bookmarks')} style={{padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--panel-2)', color:'var(--text)', fontWeight:600, fontSize:12, cursor:'pointer'}}>Save</button>
          </div>
        </div>
      </div>)}
    </div>

    <div style={{marginTop:14, padding:16, borderRadius:14, background:'var(--panel)', border:'1px solid var(--line)'}}>
      <h3 style={{margin:'0 0 6px', fontWeight:700, fontSize:14, fontFamily:"'Space Grotesk', sans-serif"}}>How Face ID works now</h3>
      <p style={{margin:0, fontSize:12, lineHeight:1.6, color:'var(--muted)'}}>No separate Face ID page. Go to <b>Attendance</b> — if not enrolled you’ll see <b>enrol now</b> and a popup guides your 5-pose scan. Need help? Use <b>Messages</b> to chat with instructors/admins.</p>
    </div>
  </div>
}
