import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'

export default function LandingPage({ instructorLoginUrl }: { instructorLoginUrl: string }) {
  return (
    <main className="landing-shell minimal">
      <header className="landing-header">
        <Link className="brand" to="/" aria-label="CCD-Attendance home">
          CCD-<span>Attendance</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ThemeToggle />
          <span className="landing-status">
            <i aria-hidden="true" /> Live
          </span>
        </div>
      </header>

      {/* Minimal catchy hero */}
      <section className="landing-hero minimal-hero" aria-label="hero">
        <div className="landing-copy">
          <p className="landing-kicker">DIT RAFIC · GPS + FACE ID</p>
          <h1>
            Attendance
            <br />
            <span>made effortless.</span>
          </h1>
          <p className="landing-intro">
            The minimal <strong>attendance system</strong> for DIT. Check in with <strong>GPS geofence</strong> + <strong>live Face ID</strong> in under 15 seconds — no sheets, no proxy, private by design.
          </p>

          <div className="role-entry-grid minimal-grid" aria-label="Choose portal">
            <Link className="role-entry role-student minimal-entry" to="/login">
              <span className="role-number">01</span>
              <div>
                <small>LEARNER</small>
                <b>Student</b>
                <p>Check in · Face ID · Today</p>
              </div>
              <i aria-hidden="true">→</i>
            </Link>
            <a className="role-entry minimal-entry" href={instructorLoginUrl}>
              <span className="role-number">02</span>
              <div>
                <small>TEACHING</small>
                <b>Instructor</b>
                <p>Sessions · Live attendance</p>
              </div>
              <i aria-hidden="true">→</i>
            </a>
          </div>

          <p className="landing-register">
            New student? <Link to="/signup">Create account</Link> <span>·</span> <a href={instructorLoginUrl}>Instructor portal</a>
          </p>

          <div className="landing-proof minimal-proof" aria-label="features">
            <span>Face ID + liveness</span>
            <i>·</i>
            <span>100 m geofence</span>
            <i>·</i>
            <span>Encrypted · 15s</span>
          </div>
        </div>

        <div className="identity-visual minimal-visual" aria-hidden="true">
          <div className="identity-orbit orbit-one" />
          <div className="identity-orbit orbit-two" />
          <div className="identity-core">
            <span>LIVE</span>
            <b>Face ID</b>
            <small>RAFIC 08:00–15:00</small>
          </div>
          <div className="signal-card signal-location">
            <span>LOCATION</span>
            <b>Verified</b>
          </div>
          <div className="signal-card signal-session">
            <span>SESSION</span>
            <b>09:30 cut-off</b>
          </div>
        </div>
      </section>

      <footer className="landing-footer minimal-footer">
        <span>CCD-Attendance © 2026 · DIT Cyber Club</span>
        <span>
          <Link to="/login">Student</Link> · <a href={instructorLoginUrl}>Instructor</a> · <Link to="/signup">Sign up</Link>
        </span>
      </footer>

      {/* Hidden SEO JSON-LD kept for crawlers */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'What is CCD-Attendance?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'CCD-Attendance is a secure student attendance system that uses GPS geofencing and live face recognition at DIT.',
                },
              },
            ],
          }),
        }}
      />
    </main>
  )
}
