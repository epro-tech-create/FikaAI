import type { Role } from './auth'

export type NavItem = { label: string; path: string; mark: string }

const adminLabels = ['Dashboard', 'Venue QR', 'Students', 'Instructors', 'Courses', 'Face Enrolments', 'Reports', 'Users and Roles', 'Audit Logs', 'System Settings', 'Profile'] as const
const instructorLabels = ['Dashboard', 'Venue QR', 'My Courses', 'Live Attendance', 'Student Attendance', 'Reports', 'Notifications', 'Profile'] as const

const slug = (label: string) => label.toLowerCase().replace(/ and /g, '-and-').replace(/ /g, '-')

export function portalNavigation(role: Extract<Role, 'admin' | 'instructor'>): NavItem[] {
  const labels = role === 'admin' ? adminLabels : instructorLabels
  const marks = role === 'admin' ? ['DB', 'VQ', 'ST', 'IN', 'CO', 'FE', 'RE', 'UR', 'AL', 'SS', 'PR'] : ['DB', 'VQ', 'MC', 'LA', 'SA', 'RE', 'NO', 'PR']
  return labels.map((label, index) => ({
    label,
    mark: marks[index],
    path: `/${role}/${label === 'Dashboard' ? 'dashboard' : slug(label)}`,
  }))
}

export function isPortalPathAllowed(pathname: string, role: Role) {
  return pathname.startsWith(`/${role}/`)
}
