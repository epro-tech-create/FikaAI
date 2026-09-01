// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loginPathPreservingVenue,
  studentCheckinPath,
  studentLoginPath,
  studentPostAuthPath,
  studentPostSignupPath,
  storeVenueCode,
  VENUE_CODE_KEY,
} from './venueCheckin'

describe('QR check-in routing', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => { values.set(key, value) },
    })
    sessionStorage.clear()
  })

  it('sends a QR login to GPS check-in, not Face ID', () => {
    expect(studentPostAuthPath('/student/checkin?code=A7K9P2X4', 'A7K9P2X4')).toBe('/student/checkin?code=A7K9P2X4')
    expect(studentPostAuthPath(null, 'A7K9P2X4')).toBe('/student/checkin?code=A7K9P2X4')
  })

  it('still uses a stored venue code when login drops the next query', () => {
    storeVenueCode('A7K9P2X4')
    expect(studentPostAuthPath(null, '')).toBe('/student/checkin?code=A7K9P2X4')
    expect(sessionStorage.getItem(VENUE_CODE_KEY)).toBe('A7K9P2X4')
  })

  it('sends a normal student login to Face ID attendance', () => {
    expect(studentPostAuthPath(null, '')).toBe('/student/attendance')
    expect(studentPostAuthPath('/admin/dashboard', '')).toBe('/student/attendance')
  })

  it('builds login with next + code so check-in survives the credentials page', () => {
    expect(studentLoginPath('/student/checkin?code=A7K9P2X4', 'A7K9P2X4')).toBe(
      '/login?next=%2Fstudent%2Fcheckin%3Fcode%3DA7K9P2X4&code=A7K9P2X4',
    )
  })

  it('keeps a pending QR on 401 / expired session instead of dumping Face ID login', () => {
    storeVenueCode('A7K9P2X4')
    expect(loginPathPreservingVenue('/student/attendance')).toBe(
      '/login?next=%2Fstudent%2Fcheckin%3Fcode%3DA7K9P2X4&code=A7K9P2X4',
    )
    expect(loginPathPreservingVenue('/student/checkin?code=A7K9P2X4')).toBe(
      '/login?next=%2Fstudent%2Fcheckin%3Fcode%3DA7K9P2X4&code=A7K9P2X4',
    )
  })

  it('builds the student check-in path from a code', () => {
    expect(studentCheckinPath('a7k9p2x4')).toBe('/student/checkin?code=A7K9P2X4')
  })

  it('sends QR signup to check-in and normal signup to Face ID enrolment', () => {
    expect(studentPostSignupPath('A7K9P2X4')).toBe('/student/checkin?code=A7K9P2X4')
    sessionStorage.removeItem(VENUE_CODE_KEY)
    expect(studentPostSignupPath('')).toBe('/student/face-enrollment')
  })

  it('does not treat /student/attendance as a venue code', () => {
    expect(studentPostAuthPath('/student/attendance', '')).toBe('/student/attendance')
    expect(loginPathPreservingVenue('/student/attendance')).toBe('/login')
  })
})
