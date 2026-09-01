import { describe, expect, it } from 'vitest'
import { displayMembershipId, displayRegistration, membershipIdError, normalizeMembershipIdInput } from './studentId'

describe('student ID', () => {
  it('keeps membership ID and registration number separate', () => {
    const student = { membershipId: 'CCD-2026-015', registrationNumber: '240545445690' }
    expect(displayMembershipId(student)).toBe('CCD-2026-015')
    expect(displayRegistration(student)).toBe('240545445690')
    expect(displayMembershipId({ membershipId: null })).toBe('—')
    expect(displayRegistration({})).toBe('—')
  })

  it('normalizes and validates CCD membership IDs', () => {
    expect(normalizeMembershipIdInput('ccd-2026-015 extra')).toBe('CCD-2026-015')
    expect(membershipIdError('')).toBe('')
    expect(membershipIdError('CCD-2026-015')).toBe('')
    expect(membershipIdError('REG-123')).toContain('CCD-2026-015')
  })
})
