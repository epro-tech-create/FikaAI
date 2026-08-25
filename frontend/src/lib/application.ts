import type { Role } from './auth'

export type Application = 'student' | 'admin' | 'instructor'

type ApplicationConfig = { role: Role; home: string; title: string; eyebrow: string }

const APPLICATIONS: Record<Application, ApplicationConfig> = {
  student: { role: 'student', home: '/student/attendance', title: 'Student App', eyebrow: 'FIELD PRACTICAL ATTENDANCE' },
  admin: { role: 'admin', home: '/admin/dashboard', title: 'Administrator Console', eyebrow: 'ADMINISTRATOR CONSOLE' },
  instructor: { role: 'instructor', home: '/instructor/dashboard', title: 'Instructor Portal', eyebrow: 'INSTRUCTOR PORTAL' },
}

export function parseApplication(value: unknown): Application | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized === 'student' || normalized === 'admin' || normalized === 'instructor' ? normalized : null
}

export function resolveApplication(value: unknown): Application {
  const application = parseApplication(value)
  if (!application) throw new Error(`Unknown application "${String(value)}". Expected one of: student, admin, instructor.`)
  return application
}

export function currentApplication(): Application {
  const raw = import.meta.env.VITE_APP_ROLE as string | undefined
  return raw && raw.trim() ? resolveApplication(raw) : 'student'
}

export function applicationConfig(application: Application): ApplicationConfig {
  return APPLICATIONS[application]
}

export function portalTitleForRole(role: Role): string {
  return APPLICATIONS[role].title
}

export function externalLoginUrl(value: unknown, fallbackOrigin: string): string {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallbackOrigin
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Application URL must use HTTP or HTTPS.')
  url.pathname = '/login'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function instructorLoginUrl(): string {
  const fallback = import.meta.env.DEV ? 'http://localhost:5175' : 'https://fikaai-instructor.vercel.app'
  return externalLoginUrl(import.meta.env.VITE_INSTRUCTOR_APP_URL, fallback)
}
