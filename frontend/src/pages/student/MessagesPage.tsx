import { useEffect, useState } from 'react'
import { api } from '../../services/api'

type Msg = { id: string; title: string; body: string; time: string; unread?: boolean }

export default function MessagesPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: '1', title: 'Welcome to CCD-Attendance', body: 'Your QR for IPT is available in RAFIC. Scan to check in — same QR all day.', time: 'Today 08:00', unread: true },
    { id: '2', title: 'Check-in open all day', body: 'For testing, check-in and check-out are open 00:00–23:59.', time: 'Today 08:05' },
    { id: '3', title: 'GPS tip', body: 'Allow precise location when prompted — we verify inside 100 m of RAFIC.', time: 'Yesterday' },
  ])
  useEffect(() => { api.get('/student/messages').then(r => { if (Array.isArray(r.data)) setMsgs(r.data) }).catch(() => {}) }, [])
  return (
    <div>
      <div className="portal-heading"><div><p>MESSAGES</p><h1>Inbox</h1><span>Updates and receipts.</span></div></div>
      <div className="msg-list">
        {msgs.map(m => (
          <article key={m.id} className={`msg-item ${m.unread ? 'unread' : ''}`}>
            <div className="msg-head"><b>{m.title}</b><span>{m.time}</span></div>
            <p>{m.body}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
