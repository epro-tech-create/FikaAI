import { describe, expect, it } from 'vitest'
import { applicationConfig, parseApplication, resolveApplication, portalTitleForRole } from './application'

describe('application configuration', () => {
  it('parses valid applications case-insensitively and rejects unknown ones', () => {
    expect(parseApplication('ADMIN')).toBe('admin')
    expect(parseApplication(' instructor ')).toBe('instructor')
    expect(parseApplication('student')).toBe('student')
    expect(parseApplication('owner')).toBeNull()
    expect(parseApplication(undefined)).toBeNull()
    expect(() => resolveApplication('superuser')).toThrow()
  })

  it('maps every application to its exclusive role, home route and title', () => {
    expect(applicationConfig('student')).toMatchObject({ role: 'student', home: '/student/attendance', title: 'Student App' })
    expect(applicationConfig('admin')).toMatchObject({ role: 'admin', home: '/admin/dashboard', title: 'Administrator Console' })
    expect(applicationConfig('instructor')).toMatchObject({ role: 'instructor', home: '/instructor/dashboard', title: 'Instructor Portal' })
  })

  it('names the portal owning each role', () => {
    expect(portalTitleForRole('student')).toBe('Student App')
    expect(portalTitleForRole('admin')).toBe('Administrator Console')
    expect(portalTitleForRole('instructor')).toBe('Instructor Portal')
  })
})
