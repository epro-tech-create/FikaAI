import { PageHeading } from '../../components/PortalUI'

const content: Record<string, { description: string; cards: [string, string][] }> = {
  'System Settings': { description: 'Review the operational defaults expected by attendance workflows.', cards: [['Attendance policy', 'Session time windows and permitted location radius are managed when sessions are created.'], ['Identity safeguards', 'Face data remains encrypted and raw captures are not retained by the portal.'], ['API connection', 'Portal requests use the configured VITE_API_BASE_URL and the current secure session.']] },
  Notifications: { description: 'A focused inbox for teaching and attendance activity.', cards: [['Session reminders', 'Upcoming session alerts will appear when the notification API is available.'], ['Attendance events', 'Receive summaries for check-ins, late arrivals, and completed sessions.'], ['Delivery preferences', 'Email and in-app preference controls can be connected without changing this layout.']] },
  Profile: { description: 'Your portal identity and access context.', cards: [['Signed in as', localStorage.getItem('fikaai.name') || 'Portal user'], ['Account security', 'Your session is protected by a short-lived access token and stays active until you sign out.'], ['Role access', `You are signed in with the ${localStorage.getItem('fikaai.role') || 'assigned'} role.`]] },
}

export default function InfoPage({ title }: { title: 'System Settings' | 'Notifications' | 'Profile' }) {
  const page = content[title]
  return <main className="portal-content"><PageHeading eyebrow="WORKSPACE" title={title} description={page.description}/><div className="info-grid">{page.cards.map(([heading, copy]) => <article className="content-card info-card" key={heading}><span>{heading.slice(0, 2).toUpperCase()}</span><h2>{heading}</h2><p>{copy}</p></article>)}</div></main>
}
