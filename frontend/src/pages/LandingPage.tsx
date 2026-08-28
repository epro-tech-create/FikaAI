import { Link } from 'react-router-dom'

export default function LandingPage({ instructorLoginUrl }: { instructorLoginUrl: string }) {
  return (
    <main className="landing-shell">
      <header className="landing-header">
        <Link className="brand" to="/" aria-label="CCD-Attendance - Student Attendance System home">
          CCD-<span>Attendance</span>
        </Link>
        <span className="landing-status">
          <i aria-hidden="true" />Attendance systems online
        </span>
      </header>

      {/* Hero - primary SEO h1 */}
      <section className="landing-hero" aria-label="CCD-Attendance hero">
        <div className="landing-copy">
          <p className="landing-kicker">IDENTITY-AWARE ATTENDANCE SYSTEM</p>
          <h1>
            The Secure
            <br />
            <span>Attendance System</span>
            <br />
            for Modern Education
          </h1>
          <p className="landing-intro">
            CCD-Attendance is the trusted <strong>student attendance system</strong> for Dar es Salaam Institute of Technology
            and universities across Tanzania. Mark <strong>attendance</strong> in seconds with <strong>GPS geofence</strong> +{' '}
            <strong>live Face ID verification</strong> — no proxy attendance, no paper sheets, fully encrypted.
          </p>

          <div className="role-entry-grid" aria-label="Choose your portal">
            <Link className="role-entry role-student" to="/login" aria-label="Sign in to student attendance portal">
              <span className="role-number">01</span>
              <div>
                <small>LEARNER ACCESS</small>
                <b>Sign in as Student</b>
                <p>Check in attendance, enrol Face ID, and review today&apos;s session.</p>
              </div>
              <i aria-hidden="true">→</i>
            </Link>
            <a className="role-entry" href={instructorLoginUrl} aria-label="Sign in to instructor attendance portal">
              <span className="role-number">02</span>
              <div>
                <small>TEACHING ACCESS</small>
                <b>Sign in as Instructor</b>
                <p>Manage attendance sessions and follow verified attendance.</p>
              </div>
              <i aria-hidden="true">→</i>
            </a>
          </div>
          <p className="landing-register">
            New student? <Link to="/signup">Create your attendance account</Link>
          </p>
        </div>

        <div className="identity-visual" aria-hidden="true">
          <div className="identity-orbit orbit-one" />
          <div className="identity-orbit orbit-two" />
          <div className="identity-core">
            <span>LIVE</span>
            <b>Face ID</b>
            <small>Encrypted match</small>
          </div>
          <div className="signal-card signal-location">
            <span>LOCATION</span>
            <b>Verified zone</b>
          </div>
          <div className="signal-card signal-session">
            <span>SESSION</span>
            <b>Ready to check in</b>
          </div>
          <div className="visual-grid" />
        </div>
      </section>

      {/* Proof / features */}
      <section className="landing-proof" aria-label="Attendance system capabilities">
        <article>
          <span>01</span>
          <div>
            <b>Live Face ID Attendance</b>
            <p>Biometric attendance with liveness prompts — blink, smile, turn. Prevents proxy attendance.</p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <b>GPS Geofenced Attendance</b>
            <p>Attendance bound to approved practical areas — 100 m perimeter at DIT RAFIC Building.</p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <b>Private by Design</b>
            <p>Encrypted attendance profiles; raw face captures are never retained or stored.</p>
          </div>
        </article>
      </section>

      {/* SEO: Attendance system explanation - keyword-rich content for crawlers */}
      <section className="landing-seo" aria-labelledby="attendance-system-heading">
        <div className="landing-seo-grid">
          <div>
            <h2 id="attendance-system-heading">Why CCD-Attendance is the Leading Attendance System in Tanzania</h2>
            <p>
              Unlike manual registers or card-based <strong>attendance systems</strong>, CCD-Attendance combines{' '}
              <strong>GPS location verification</strong> and <strong>live face recognition attendance</strong> to create a
              fraud-proof record. Each <strong>attendance</strong> check-in requires you to be inside the geofenced training
              zone <em>and</em> pass a live Face ID challenge — ensuring every attendance entry is genuine.
            </p>
            <ul className="seo-list">
              <li>
                <strong>Biometric attendance system</strong> — ArcFace embeddings encrypted at rest (Fernet), never returned
                via API.
              </li>
              <li>
                <strong>Geofence attendance</strong> — configurable radius, campus timezone aware (Africa/Dar_es_Salaam).
              </li>
              <li>
                <strong>Real-time attendance</strong> — instructors see verified check-ins instantly with late/present status.
              </li>
              <li>
                <strong>Attendance for practical training</strong> — built for DIT&apos;s cybersecurity industrial practicals, adaptable to any
                course or university.
              </li>
            </ul>
          </div>
          <div className="seo-highlights">
            <h3>Trusted for Student Attendance</h3>
            <dl>
              <div>
                <dt>Attendance fraud</dt>
                <dd>Eliminated — liveness + location + face match</dd>
              </div>
              <div>
                <dt>Check-in time</dt>
                <dd>&lt; 15 seconds average</dd>
              </div>
              <div>
                <dt>Privacy</dt>
                <dd>Raw images processed in memory, never stored</dd>
              </div>
              <div>
                <dt>Uptime</dt>
                <dd>Campus-time session engine with grace periods</dd>
              </div>
            </dl>
            <p className="seo-cta">
              <Link to="/signup">Start marking attendance securely →</Link>
            </p>
          </div>
        </div>
      </section>

      {/* How attendance works */}
      <section className="landing-steps" aria-labelledby="how-attendance-works">
        <h2 id="how-attendance-works">How the Attendance System Works</h2>
        <ol>
          <li>
            <b>1. Enrol Face ID</b>
            <span>Create your student attendance profile with a guided face enrolment. Encrypted on day one.</span>
          </li>
          <li>
            <b>2. Enter Geofence</b>
            <span>Arrive at DIT RAFIC Building. GPS verifies you&apos;re inside the attendance perimeter.</span>
          </li>
          <li>
            <b>3. Live Face Scan</b>
            <span>Complete a 4-second liveness challenge. Face matched against your encrypted attendance profile.</span>
          </li>
          <li>
            <b>4. Attendance Recorded</b>
            <span>Present / Late status auto-calculated. Check-out handled the same secure way.</span>
          </li>
        </ol>
      </section>

      {/* FAQ - targets long-tail attendance queries and powers FAQ schema */}
      <section className="landing-faq" aria-labelledby="attendance-faq-heading">
        <h2 id="attendance-faq-heading">Attendance System FAQ</h2>
        <dl>
          <div>
            <dt>What is CCD-Attendance?</dt>
            <dd>
              CCD-Attendance is a secure <strong>student attendance system</strong> that uses GPS geofencing and live face
              recognition to verify attendance for practical training at DIT and universities in Tanzania.
            </dd>
          </div>
          <div>
            <dt>How does the face recognition attendance work?</dt>
            <dd>
              During check-in you complete a liveness challenge (blink, smile, or head turn). Our attendance system captures
              12–16 frames, verifies liveness on-device via MediaPipe, then matches against your encrypted Face ID on the
              server using InsightFace ArcFace. No raw photos are stored.
            </dd>
          </div>
          <div>
            <dt>Is my biometric attendance data private?</dt>
            <dd>
              Yes. Face embeddings are encrypted with Fernet at rest and never exposed via API. Raw captures are processed
              in memory and discarded — private by design.
            </dd>
          </div>
          <div>
            <dt>Can I mark attendance outside the campus?</dt>
            <dd>
              No. The geofence attendance system requires you to be within the configured perimeter (100 m at DIT RAFIC) with
              GPS accuracy under 100 m. This prevents proxy attendance.
            </dd>
          </div>
          <div>
            <dt>Who can use this attendance system?</dt>
            <dd>
              Students mark attendance via the student portal; instructors manage sessions and view real-time attendance
              reports. Admins oversee courses, students, and attendance analytics.
            </dd>
          </div>
        </dl>
      </section>

      <footer className="landing-footer">
        <span>CCD-Attendance — Secure Attendance System © 2026</span>
        <span>
          <Link to="/login">Student Attendance Login</Link> · <a href={instructorLoginUrl}>Instructor Attendance Portal</a> ·{' '}
          <Link to="/signup">Create Attendance Account</Link>
        </span>
      </footer>

      {/* FAQ Structured Data for rich results when users search 'attendance system' */}
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
                  text: 'CCD-Attendance is a secure student attendance system that uses GPS geofencing and live face recognition to verify attendance for practical training at DIT and universities in Tanzania.',
                },
              },
              {
                '@type': 'Question',
                name: 'How does the face recognition attendance work?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'During check-in you complete a liveness challenge. The system captures frames, verifies liveness via MediaPipe, then matches against your encrypted Face ID using InsightFace ArcFace. No raw photos are stored.',
                },
              },
              {
                '@type': 'Question',
                name: 'Is my biometric attendance data private?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Yes. Face embeddings are encrypted at rest and never exposed via API. Raw captures are processed in memory and discarded.',
                },
              },
              {
                '@type': 'Question',
                name: 'Can I mark attendance outside the campus?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'No. The geofence attendance system requires you to be within the configured perimeter (100m at DIT RAFIC) with GPS accuracy under 100m.',
                },
              },
              {
                '@type': 'Question',
                name: 'Who can use this attendance system?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Students mark attendance via the student portal; instructors manage sessions and view reports. Admins oversee courses and analytics.',
                },
              },
            ],
          }),
        }}
      />
    </main>
  )
}
