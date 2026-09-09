import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'

type Conv = { id:string; title:string; peer: {id:string; fullName:string; email:string; role:string}|null; lastMessage: {body:string; createdAt:string}|null; unreadCount:number; updatedAt:string|null }
type Msg = { id:string; body:string; senderId:string; senderName:string; createdAt:string }
type SearchUser = { id:string; fullName:string; email:string; role:string }

export default function ChatPage(){
  const [convs,setConvs]=useState<Conv[]>([])
  const [activeId,setActiveId]=useState<string|null>(null)
  const [msgs,setMsgs]=useState<Msg[]>([])
  const [input,setInput]=useState('')
  const [sending,setSending]=useState(false)
  const [searchQ,setSearchQ]=useState('')
  const [showNew,setShowNew]=useState(false)
  const [newQ,setNewQ]=useState('')
  const [userSearch,setUserSearch]=useState<SearchUser[]>([])
  const bottomRef=useRef<HTMLDivElement>(null)
  const meId = (()=>{ try{ const t=localStorage.getItem('ccd.access')||localStorage.getItem('fikaai.access')||''; const p=JSON.parse(atob(t.split('.')[1])); return p.sub as string }catch{return ''}})()
  const activeConv = convs.find(c=>c.id===activeId) || null

  async function loadConvs(){ try{ const r=await api.get('/chat/conversations'); if(Array.isArray(r.data)) setConvs(r.data)}catch{} }
  async function loadMessages(id:string){
    try{
      const r=await api.get(`/chat/conversations/${id}/messages?limit=80`)
      if(Array.isArray(r.data)) setMsgs(r.data)
      await api.post(`/chat/conversations/${id}/read`).catch(()=>{})
      loadConvs()
    }catch{}
  }
  useEffect(()=>{ loadConvs(); const t=setInterval(loadConvs,5000); const onFocus=()=>loadConvs(); window.addEventListener('focus',onFocus); return()=>{clearInterval(t); window.removeEventListener('focus',onFocus)}},[])
  useEffect(()=>{ if(!activeId) return; loadMessages(activeId); const t=setInterval(()=>loadMessages(activeId!),3000); return()=>clearInterval(t)},[activeId])
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}) },[msgs])
  useEffect(()=>{
    if(!showNew) return
    const q=newQ.trim()
    const h=setTimeout(async()=>{ try{ const r=await api.get(`/chat/users/search?q=${encodeURIComponent(q)}&limit=12`); setUserSearch(r.data)}catch{setUserSearch([])} },280)
    return()=>clearTimeout(h)
  },[newQ,showNew])
  async function startChatWith(userId:string){
    try{ const r=await api.post('/chat/conversations', { participantUserIds:[userId] }); const id=r.data.id as string; setShowNew(false); setNewQ(''); await loadConvs(); setActiveId(id)}catch{}
  }
  async function send(){
    const body=input.trim()
    if(!body || !activeId || sending) return
    const idem=crypto.randomUUID()
    setSending(true)
    const optimistic: Msg = { id: idem, body, senderId: meId, senderName: 'You', createdAt: new Date().toISOString() }
    setMsgs(m=>[...m, optimistic]); setInput('')
    try{ await api.post(`/chat/conversations/${activeId}/messages`, { body, idempotencyKey: idem }); await loadMessages(activeId!)}catch{} finally{ setSending(false) }
  }
  const filteredConvs = searchQ.trim() ? convs.filter(c=> c.title.toLowerCase().includes(searchQ.toLowerCase()) || (c.peer?.email.toLowerCase().includes(searchQ.toLowerCase()))) : convs

  return <div className="portal-content" style={{paddingTop:24, paddingBottom:32}}>
    <div className="portal-heading"><div><p>COMMUNICATION</p><h1>Chat</h1><span>WhatsApp-like help desk — students ask, instructors & admins reply.</span></div><button className="portal-primary" onClick={()=>setShowNew(v=>!v)}>New chat</button></div>
    <div className="chat-shell" style={{height:'calc(100dvh - 300px)', minHeight:480}}>
      <div className="chat-list-pane">
        <div className="chat-search"><input placeholder="Search chats" value={searchQ} onChange={e=>setSearchQ(e.target.value)} /></div>
        {showNew && <div className="chat-new-panel">
          <input autoFocus placeholder="Search people by name or email" value={newQ} onChange={e=>setNewQ(e.target.value)} />
          <div className="chat-user-results">
            {userSearch.map(u=> <button key={u.id} className="chat-user-row" onClick={()=>startChatWith(u.id)}>
              <span className="chat-avatar">{u.fullName.slice(0,1).toUpperCase()}</span>
              <span><b>{u.fullName}</b><small>{u.email} · {u.role}</small></span>
            </button>)}
            {!userSearch.length && <small style={{color:'var(--muted)',padding:'8px 10px',display:'block'}}>Type to find anyone</small>}
          </div>
        </div>}
        <div className="chat-convs">
          {filteredConvs.length===0 && <div className="chat-empty">No chats yet. Start a chat with a student or instructor.</div>}
          {filteredConvs.map(c=> <button key={c.id} className={`chat-conv ${activeId===c.id?'active':''}`} onClick={()=>setActiveId(c.id)}>
            <span className="chat-avatar">{(c.title||'?').slice(0,1).toUpperCase()}</span>
            <span className="chat-conv-main">
              <b>{c.title}<i>{c.updatedAt? new Date(c.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):''}</i></b>
              <small>{c.lastMessage?.body.slice(0,38) || 'No messages yet'}</small>
            </span>
            {c.unreadCount>0 && <span className="chat-badge">{c.unreadCount}</span>}
          </button>)}
        </div>
      </div>
      <div className="chat-main-pane">
        {!activeId ? <div className="chat-welcome"><div className="chat-welcome-card">
          <span style={{fontSize:32}}>💬</span><h3>Chat help desk</h3><p>Select a conversation or start a new one. Students can message instructors/admins for help; replies appear here in real time (polling — WS upgrade ready).</p>
        </div></div> : <>
          <div className="chat-header">
            <span className="chat-avatar small">{(activeConv?.title||'?').slice(0,1).toUpperCase()}</span>
            <span className="chat-header-info"><b>{activeConv?.title}</b><small>{activeConv?.peer? `${activeConv.peer.role} · ${activeConv.peer.email}`:'Group'}</small></span>
          </div>
          <div className="chat-messages">
            {msgs.map(m=>{ const mine=m.senderId===meId; return <div key={m.id} className={`chat-bubble-row ${mine?'mine':''}`}><div className={`chat-bubble ${mine?'mine':''}`}><span>{m.body}</span><small>{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} {mine?'✓✓':''}</small></div></div>})}
            <div ref={bottomRef} />
          </div>
          <div className="chat-input-bar">
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send()}}} placeholder="Type a message" />
            <button className="chat-send" onClick={send} disabled={!input.trim()||sending}>➤</button>
          </div>
        </>}
      </div>
    </div>
  </div>
}
