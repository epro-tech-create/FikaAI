export type Role = 'admin' | 'instructor' | 'student'

const ROLE_KEY = 'fikaai.role'

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
  return parseRole(localStorage.getItem(ROLE_KEY))
}

export function storeAuthentication(data: Record<string, unknown>) {
  const accessToken = data.access_token ?? data.accessToken
  const fullName = data.full_name ?? data.fullName
  const role = parseRole(data.role)
  if (typeof accessToken !== 'string' || !role) throw new Error('The server returned an invalid sign-in response.')
  localStorage.setItem('fikaai.access', accessToken)
  localStorage.setItem(ROLE_KEY, role)
  if (typeof fullName === 'string') localStorage.setItem('fikaai.name', fullName)
  return role
}

export function clearAuthentication() {
  localStorage.removeItem('fikaai.access')
  localStorage.removeItem('fikaai.name')
  localStorage.removeItem(ROLE_KEY)
}
