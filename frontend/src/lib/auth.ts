export type Role = 'admin' | 'instructor' | 'student'

const ROLE_KEY = 'ccd.role'
const FACE_ENROLLED_KEY = 'ccd.face-enrolled'

export function parseRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null
  const role = value.toLowerCase()
  return role === 'admin' || role === 'instructor' || role === 'student' ? role : null
}

export function roleHome(role: Role | null) {
  if (role === 'admin') return '/admin/dashboard'
  if (role === 'instructor') return '/instructor/dashboard'
  if (role === 'student') return '/student/attendance'
  return '/login'
}

export function getStoredRole() {
  const v = localStorage.getItem(ROLE_KEY) ?? localStorage.getItem('fikaai.role')
  return parseRole(v)
}

export function storeAuthentication(data: Record<string, unknown>) {
  const accessToken = data.access_token ?? data.accessToken
  const fullName = data.full_name ?? data.fullName
  const role = parseRole(data.role)
  if (typeof accessToken !== 'string' || !role) throw new Error('The server returned an invalid sign-in response.')
  localStorage.setItem('ccd.access', accessToken)
  localStorage.setItem(ROLE_KEY, role)
  localStorage.removeItem(FACE_ENROLLED_KEY)
  if (typeof fullName === 'string') localStorage.setItem('ccd.name', fullName)
  return role
}

export function getStoredFaceEnrollment() {
  if (localStorage.getItem(FACE_ENROLLED_KEY) === 'true') return true
  // legacy fikaai key migration
  if (localStorage.getItem('fikaai.face-enrolled') === 'true') {
    localStorage.setItem(FACE_ENROLLED_KEY, 'true')
    return true
  }
  return false
}

export function storeFaceEnrollment(enrolled: boolean) {
  if (enrolled) localStorage.setItem(FACE_ENROLLED_KEY,'true')
  else localStorage.removeItem(FACE_ENROLLED_KEY)
}

export function clearAuthentication() {
  localStorage.removeItem('ccd.access')
  localStorage.removeItem('fikaai.access')
  localStorage.removeItem('ccd.name')
  localStorage.removeItem('fikaai.name')
  localStorage.removeItem(ROLE_KEY)
  localStorage.removeItem('fikaai.role')
  localStorage.removeItem(FACE_ENROLLED_KEY)
  localStorage.removeItem('fikaai.face-enrolled')
}
