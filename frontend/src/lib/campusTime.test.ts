import { describe, expect, it } from 'vitest'
import { campusGreeting, formatCampusTime } from './campusTime'

describe('campus time', () => {
  it.each([
    ['2026-08-28T08:59:00Z', 'Good morning'],
    ['2026-08-28T09:00:00Z', 'Good afternoon'],
    ['2026-08-28T14:59:00Z', 'Good afternoon'],
    ['2026-08-28T15:00:00Z', 'Good evening'],
  ])('uses Dar es Salaam time for %s', (instant, greeting) => {
    expect(campusGreeting(new Date(instant))).toBe(greeting)
  })

  it('formats schedule instants in campus time', () => {
    expect(formatCampusTime('2026-08-28T12:00:00Z')).toMatch(/03:00|15:00/)
  })
})
