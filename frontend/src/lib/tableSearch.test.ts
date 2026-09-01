import { describe, expect, it } from 'vitest'
import { matchesSearch } from './tableSearch'

describe('table search', () => {
  const row = { fullName: 'Akram Musa', registrationNumber: '230627451607', email: 'akram@example.com', status: 'PRESENT' }

  it('matches name, registration, or email', () => {
    expect(matchesSearch(row, 'akram', ['fullName', 'registrationNumber', 'email'])).toBe(true)
    expect(matchesSearch(row, '230627', ['fullName', 'registrationNumber', 'email'])).toBe(true)
    expect(matchesSearch(row, 'byabato', ['fullName', 'registrationNumber', 'email'])).toBe(false)
  })

  it('shows every row when the query is empty', () => {
    expect(matchesSearch(row, '  ', ['fullName'])).toBe(true)
  })
})
