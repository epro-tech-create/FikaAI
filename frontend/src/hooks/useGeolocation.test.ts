// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocation } from './useGeolocation'

describe('getLocation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns a fresh high-accuracy device position', async () => {
    const getCurrentPosition = vi.fn().mockImplementation((success: PositionCallback) => {
      success({
        coords: { latitude: -6.8151, longitude: 39.2793, accuracy: 12 },
      } as GeolocationPosition)
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    await expect(getLocation()).resolves.toMatchObject({
      latitude: -6.8151,
      longitude: 39.2793,
      accuracyMeters: 12,
    })
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy:true, timeout:15000, maximumAge:0 },
    )
  })
})
