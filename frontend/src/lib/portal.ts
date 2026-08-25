import type { Role } from './auth'

export type NavItem = { label: string; path: string; mark: string }

const adminLabels = ['Dashboard', 'Students', 'Instructors', 'Courses', 'Locations', 'Attendance Sessions', 'Face Enrolments', 'Reports', 'Users and Roles', 'Audit Logs', 'System Settings', 'Profile'] as const
const instructorLabels = ['Dashboard', 'My Courses', 'Attendance Sessions', 'Live Attendance', 'Student Attendance', 'Reports', 'Notifications', 'Profile'] as const

const slug = (label: string) => label.toLowerCase().replace(/ and /g, '-and-').replace(/ /g, '-')

export function portalNavigation(role: Extract<Role, 'admin' | 'instructor'>): NavItem[] {
  const labels = role === 'admin' ? adminLabels : instructorLabels
  const marks = role === 'admin' ? ['DB', 'ST', 'IN', 'CO', 'LO', 'AS', 'FE', 'RE', 'UR', 'AL', 'SS', 'PR'] : ['DB', 'MC', 'AS', 'LA', 'SA', 'RE', 'NO', 'PR']
  return labels.map((label, index) => ({
    label,
    mark: marks[index],
    path: `/${role}/${label === 'Dashboard' ? 'dashboard' : slug(label)}`,
  }))
}

export function isPortalPathAllowed(pathname: string, role: Role) {
  return pathname.startsWith(`/${role}/`)
}
