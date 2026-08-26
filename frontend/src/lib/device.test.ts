// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRegistrationDeviceId } from './device'

describe('registration device identity', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('creates and reuses one identifier for the browser', () => {
    const deviceId = '12345678-1234-4234-9234-123456789abc' as `${string}-${string}-${string}-${string}-${string}`
    const randomUUID = vi.spyOn(crypto,'randomUUID').mockReturnValue(deviceId)

    expect(getRegistrationDeviceId()).toBe(deviceId)
    expect(getRegistrationDeviceId()).toBe(deviceId)
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })
})
