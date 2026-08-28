// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocation } from './useGeolocation'

describe('getLocation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('waits for a precise reading instead of using the first coarse position', async () => {
    const clearWatch = vi.fn()
    const watchPosition = vi.fn().mockImplementation((success: PositionCallback) => {
      window.setTimeout(() => success({ coords: { latitude: -6.81, longitude: 39.28, accuracy: 90 }, timestamp: Date.now() } as GeolocationPosition), 1)
      window.setTimeout(() => success({ coords: { latitude: -6.8137482, longitude: 39.2801352, accuracy: 12 }, timestamp: Date.now() } as GeolocationPosition), 2)
      return 7
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } })

    await expect(getLocation()).resolves.toMatchObject({
      latitude: -6.8137482,
      longitude: 39.2801352,
      accuracyMeters: 12,
    })
    expect(watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy:true, timeout:12000, maximumAge:0 },
    )
    expect(clearWatch).toHaveBeenCalledWith(7)
  })

  it('returns the best available reading when acquisition times out', async () => {
    vi.useFakeTimers()
    const watchPosition = vi.fn().mockImplementation((success: PositionCallback) => {
      success({ coords: { latitude: -6.8138, longitude: 39.2801, accuracy: 65 }, timestamp: Date.now() } as GeolocationPosition)
      return 8
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch: vi.fn() } })

    const location = getLocation()
    await vi.advanceTimersByTimeAsync(12_000)
    await expect(location).resolves.toMatchObject({ accuracyMeters: 65 })
  })
})
