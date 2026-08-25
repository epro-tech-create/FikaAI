import { describe, expect, it } from 'vitest'
import { instructorFormError } from './InstructorPage'

describe('instructor registration form', () => {
  it('accepts a matching strong password', () => {
    expect(instructorFormError({ fullName: 'Amina Mushi', email: 'amina@example.com', password: 'SecurePass9', confirmPassword: 'SecurePass9' })).toBe('')
  })

  it('rejects mismatched passwords', () => {
    expect(instructorFormError({ fullName: 'Amina Mushi', email: 'amina@example.com', password: 'SecurePass9', confirmPassword: 'SecurePass8' })).toBe('Passwords do not match.')
  })

  it('rejects weak passwords', () => {
    expect(instructorFormError({ fullName: 'Amina Mushi', email: 'amina@example.com', password: 'password', confirmPassword: 'password' })).toContain('uppercase')
  })
})
