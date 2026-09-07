export type Reminder = { id: string; title: string; body: string; time: string }

const KEY = 'ccd.reminders.v1'
const SEEN_KEY = 'ccd.reminders.seen'

function campusNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Dar_es_Salaam' }))
}
function hm(d: Date) { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }

export function getReminders(): Reminder[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
export function pushReminder(r: Reminder) {
  const list = getReminders()
  if (list.find(x => x.id === r.id)) return
  const next = [r, ...list].slice(0, 20)
  localStorage.setItem(KEY, JSON.stringify(next))
  // notify listeners
  window.dispatchEvent(new Event('ccd-reminders'))
}
export function markSeen() {
  localStorage.setItem(SEEN_KEY, String(Date.now()))
  window.dispatchEvent(new Event('ccd-reminders'))
}
export function unseenCount() {
  const seen = Number(localStorage.getItem(SEEN_KEY) || '0')
  return getReminders().filter(r => new Date(r.time).getTime() > seen).length
}

export function checkRemindersTick() {
  const now = campusNow()
  const today = now.toISOString().slice(0,10)
  const h = hm(now)
  // 08:00 check-in open
  if (h === '08:00') pushReminder({ id:`open-${today}`, title:'Check-in open', body:'Check-in is now open until 15:00. Arrive by 09:30 to be early.', time: new Date().toISOString() })
  if (h === '09:15') pushReminder({ id:`cutoff-${today}`, title:'Late cutoff in 15 min', body:'Arrive before 09:30 to be PRESENT. After 09:30 you are LATE.', time: new Date().toISOString() })
  if (h === '14:55') pushReminder({ id:`checkout-soon-${today}`, title:'Checkout in 5 min', body:'Checkout opens at 15:00. Stay until 17:00.', time: new Date().toISOString() })
  if (h === '15:00') pushReminder({ id:`checkout-${today}`, title:'Checkout open', body:'You can now check out until 17:00.', time: new Date().toISOString() })
}

export function startReminderLoop() {
  checkRemindersTick()
  const id = window.setInterval(checkRemindersTick, 60_000)
  return () => window.clearInterval(id)
}
