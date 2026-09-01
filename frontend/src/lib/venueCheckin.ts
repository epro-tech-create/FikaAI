/** Room QR → GPS check-in/out. Never send a QR scan to the Face ID page. */

export const VENUE_CODE_KEY = 'ccd.venueCode'
export const VENUE_CODE_RE = /^[A-Z0-9]{8}$/

export function normalizeVenueCode(raw: string | null | undefined): string {
  const code = (raw || '').trim().toUpperCase()
  return VENUE_CODE_RE.test(code) ? code : ''
}

export function storeVenueCode(code: string): string {
  const normalized = normalizeVenueCode(code)
  if (normalized) sessionStorage.setItem(VENUE_CODE_KEY, normalized)
  return normalized
}

export function readStoredVenueCode(): string {
  return normalizeVenueCode(typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(VENUE_CODE_KEY))
}

export function clearStoredVenueCode() {
  sessionStorage.removeItem(VENUE_CODE_KEY)
}

export function extractVenueCode(raw: string | null | undefined): string {
  if (!raw) return ''
  const direct = normalizeVenueCode(raw)
  if (direct) return direct
  try {
    const url = new URL(raw, 'https://attendance.local')
    return normalizeVenueCode(url.searchParams.get('code'))
  } catch {
    return ''
  }
}

export function studentCheckinPath(code?: string): string {
  const venue = normalizeVenueCode(code) || readStoredVenueCode()
  return venue ? `/student/checkin?code=${encodeURIComponent(venue)}` : '/student/checkin'
}

export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

export function studentLoginPath(nextPath?: string, code?: string): string {
  const venue = normalizeVenueCode(code) || extractVenueCode(nextPath) || readStoredVenueCode()
  if (venue) storeVenueCode(venue)
  const dest = safeNextPath(nextPath) || studentCheckinPath(venue)
  const params = new URLSearchParams()
  params.set('next', dest)
  if (venue) params.set('code', venue)
  return `/login?${params.toString()}`
}

/** Login / 401 / Guard: keep the student on the QR check-in path. */
export function loginPathPreservingVenue(currentPath?: string): string {
  const here = currentPath
    ?? (typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`)
  const venue = extractVenueCode(here) || readStoredVenueCode()
  if (venue || /\/checkin(?:\?|$)/.test(here)) {
    const next = here.includes('/checkin') ? (safeNextPath(here) || studentCheckinPath(venue)) : studentCheckinPath(venue)
    return studentLoginPath(next, venue)
  }
  return '/login'
}

/** After student sign-in or signup: QR continues to GPS check-in/out, not Face ID. */
export function studentPostAuthPath(next: string | null | undefined, codeFromQuery: string): string {
  const venue = normalizeVenueCode(codeFromQuery) || extractVenueCode(next) || readStoredVenueCode()
  if (venue) {
    storeVenueCode(venue)
    return studentCheckinPath(venue)
  }
  const dest = safeNextPath(next)
  if (dest && dest.startsWith('/student/checkin')) return dest
  return '/student/attendance'
}

/** After student sign-up: QR continues to GPS check-in; otherwise Face ID enrolment. */
export function studentPostSignupPath(codeFromQuery: string): string {
  const dest = studentPostAuthPath(null, codeFromQuery)
  return dest === '/student/attendance' ? '/student/face-enrollment' : dest
}
