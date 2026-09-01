import { describe, expect, it } from 'vitest'
import { parseRole, roleHome } from './auth'
import { isPortalPathAllowed, portalNavigation } from './portal'

describe('role routing', () => {
  it('normalizes known roles and rejects unknown roles', () => {
    expect(parseRole('ADMIN')).toBe('admin')
    expect(parseRole('owner')).toBeNull()
  })

  it('routes each role to its landing page', () => {
    expect(roleHome('admin')).toBe('/admin/dashboard')
    expect(roleHome('instructor')).toBe('/instructor/dashboard')
    expect(roleHome('student')).toBe('/student/attendance')
  })

  it('provides exact role navigation and rejects cross-role paths', () => {
    expect(portalNavigation('admin').map(item => item.label)).toEqual([
      'Dashboard', 'Students', 'Instructors', 'Face Enrolments', 'Reports',
      'Users and Roles', 'Audit Logs', 'System Settings', 'Profile',
    ])
    expect(portalNavigation('instructor').map(item => item.label)).toEqual([
      'Dashboard', 'Live Attendance', 'Student Attendance', 'Reports', 'Notifications', 'Profile',
    ])
    expect(portalNavigation('admin').some(item => item.path.includes('locations') || item.path.includes('attendance-sessions'))).toBe(false)
    expect(portalNavigation('instructor').some(item => item.path.includes('attendance-sessions'))).toBe(false)
    expect(isPortalPathAllowed('/admin/students', 'instructor')).toBe(false)
  })
})
