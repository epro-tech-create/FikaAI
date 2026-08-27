// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAuthentication,
  getStoredFaceEnrollment,
  storeAuthentication,
  storeFaceEnrollment,
} from './auth'

describe('face enrollment session state', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    })
    localStorage.clear()
  })

  it('carries successful enrollment into the attendance page', () => {
    storeFaceEnrollment(true)

    expect(getStoredFaceEnrollment()).toBe(true)

    storeFaceEnrollment(false)
    expect(getStoredFaceEnrollment()).toBe(false)
  })

  it('clears enrollment state when the authenticated user changes', () => {
    storeFaceEnrollment(true)

    storeAuthentication({ accessToken:'token',role:'student',fullName:'Student' })

    expect(getStoredFaceEnrollment()).toBe(false)
    clearAuthentication()
    expect(localStorage.getItem('fikaai.access')).toBeNull()
  })
})
