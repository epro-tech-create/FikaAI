import { Link } from 'react-router-dom'

export default function LandingPage({ instructorLoginUrl }: { instructorLoginUrl: string }) {
  return <main className="landing-shell">
    <header className="landing-header">
      <Link className="brand" to="/" aria-label="FikaAI home">Fika<span>AI</span></Link>
      <span className="landing-status"><i/>Attendance systems online</span>
    </header>

    <section className="landing-hero">
      <div className="landing-copy">
        <p className="landing-kicker">IDENTITY-AWARE ATTENDANCE</p>
        <h1>Show up.<br/><span>Prove it securely.</span></h1>
        <p className="landing-intro">One secure workspace for practical attendance, live identity verification, and trusted class records.</p>

        <div className="role-entry-grid" aria-label="Choose your portal">
          <Link className="role-entry role-student" to="/login">
            <span className="role-number">01</span>
            <div><small>LEARNER ACCESS</small><b>Sign in as Student</b><p>Check in, enrol Face ID, and review today’s session.</p></div>
            <i aria-hidden="true">→</i>
          </Link>
          <a className="role-entry" href={instructorLoginUrl}>
            <span className="role-number">02</span>
            <div><small>TEACHING ACCESS</small><b>Sign in as Instructor</b><p>Manage sessions and follow verified attendance.</p></div>
            <i aria-hidden="true">→</i>
          </a>
        </div>
        <p className="landing-register">New student? <Link to="/signup">Create your account</Link></p>
      </div>

      <div className="identity-visual" aria-hidden="true">
        <div className="identity-orbit orbit-one"/><div className="identity-orbit orbit-two"/>
        <div className="identity-core"><span>LIVE</span><b>Face ID</b><small>Encrypted match</small></div>
        <div className="signal-card signal-location"><span>LOCATION</span><b>Verified zone</b></div>
        <div className="signal-card signal-session"><span>SESSION</span><b>Ready to check in</b></div>
        <div className="visual-grid"/>
      </div>
    </section>

    <section className="landing-proof" aria-label="Security capabilities">
      <article><span>01</span><div><b>Live identity</b><p>Multi-angle Face ID with liveness prompts.</p></div></article>
      <article><span>02</span><div><b>Location aware</b><p>Attendance bound to approved practical areas.</p></div></article>
      <article><span>03</span><div><b>Private by design</b><p>Encrypted profiles; raw captures are not retained.</p></div></article>
    </section>

    <footer className="landing-footer"><span>FikaAI Attendance Intelligence</span><span>Secure · Verifiable · Role protected</span></footer>
  </main>
}
