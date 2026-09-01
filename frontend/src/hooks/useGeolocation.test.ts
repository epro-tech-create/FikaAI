// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocation, readingFrom } from './useGeolocation'

describe('getLocation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('clamps huge iPhone accuracy values so the API accepts them', () => {
    const location = readingFrom({
      coords: { latitude: -6.8137, longitude: 39.2801, accuracy: 150_000 },
      timestamp: Date.now(),
    } as GeolocationPosition)
    expect(location.accuracyMeters).toBe(99_999)
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
      { enableHighAccuracy:true, timeout:20000, maximumAge:0 },
    )
    expect(clearWatch).toHaveBeenCalledWith(7)
  })

  it('returns the best available reading when acquisition times out', async () => {
    vi.useFakeTimers()
    const watchPosition = vi.fn().mockImplementation((success: PositionCallback) => {
      success({ coords: { latitude: -6.8138, longitude: 39.2801, accuracy: 120 }, timestamp: Date.now() } as GeolocationPosition)
      return 8
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch: vi.fn() } })

    const location = getLocation()
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(location).resolves.toMatchObject({ accuracyMeters: 120 })
  })

  it('retries without high accuracy after iPhone permission denial', async () => {
    const watchPosition = vi.fn()
      .mockImplementationOnce((_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError)
        return 1
      })
      .mockImplementationOnce((success: PositionCallback) => {
        success({ coords: { latitude: -6.8137482, longitude: 39.2801352, accuracy: 40 }, timestamp: Date.now() } as GeolocationPosition)
        return 2
      })
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch: vi.fn() } })

    await expect(getLocation()).resolves.toMatchObject({
      latitude: -6.8137482,
      longitude: 39.2801352,
      accuracyMeters: 40,
    })
    expect(watchPosition).toHaveBeenCalledTimes(2)
  })
})
