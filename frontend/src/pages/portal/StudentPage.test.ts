import { describe, expect, it } from 'vitest'
import { studentFormError } from './StudentPage'

const validForm = { fullName: 'Amina Mushi', email: 'amina@example.com', membershipId: 'CCD-2026-015', registrationNumber: '2402424123456', isActive: true, password: 'SecurePass9', confirmPassword: 'SecurePass9' }

describe('student form', () => {
  it('requires numeric registration numbers', () => {
    expect(studentFormError({ ...validForm, registrationNumber: 'REG-123' })).toContain('only digits')
  })

  it('accepts a CCD membership student ID', () => {
    expect(studentFormError({ ...validForm, membershipId: 'ccd-2026-015' })).toBe('')
    expect(studentFormError({ ...validForm, membershipId: 'REG-123' })).toContain('CCD-2026-015')
  })

  it('requires a strong matching password for creation', () => {
    expect(studentFormError(validForm)).toBe('')
    expect(studentFormError({ ...validForm, confirmPassword: 'SecurePass8' })).toBe('Passwords do not match.')
  })

  it('allows an omitted edit password but validates a replacement', () => {
    expect(studentFormError({ ...validForm, password: '', confirmPassword: '' }, true)).toBe('')
    expect(studentFormError({ ...validForm, password: 'weak', confirmPassword: 'weak' }, true)).toContain('uppercase')
  })
})
