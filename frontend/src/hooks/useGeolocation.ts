type DeviceLocation = { latitude:number; longitude:number; accuracyMeters:number; capturedAt:string }

const TARGET_ACCURACY_METERS = 80
const ACQUISITION_TIMEOUT_MS = 20_000
const MAX_REPORTED_ACCURACY_METERS = 99_999

export function permissionHelp() {
  const apple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/i.test(navigator.userAgent)
  if (apple) {
    return 'Location is blocked. On iPhone: Settings → Safari → Location → While Using the App, and turn Precise Location on. Come back and tap Allow location.'
  }
  return 'Location permission was denied. Enable location for this site in your browser settings, then tap Allow location.'
}

export function readingFrom(position: GeolocationPosition): DeviceLocation {
  const raw = Number(position.coords.accuracy)
  const accuracy = Number.isFinite(raw) && raw >= 0 ? Math.min(raw, MAX_REPORTED_ACCURACY_METERS) : MAX_REPORTED_ACCURACY_METERS
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyMeters: accuracy,
    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
  }
}

function watchLocation(options: PositionOptions): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS is not available on this device.'))

    let best: DeviceLocation | undefined
    let watchId: number | undefined
    let finished = false

    const stop = () => {
      window.clearTimeout(timeoutId)
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
    }
    const succeed = (location: DeviceLocation) => {
      if (finished) return
      finished = true
      stop()
      resolve(location)
    }
    const fail = (error: GeolocationPositionError) => {
      if (finished) return
      if (best && error.code !== error.PERMISSION_DENIED) return succeed(best)
      finished = true
      stop()
      const denied = error.code === error.PERMISSION_DENIED
      reject(new Error(denied ? permissionHelp() : error.code === error.TIMEOUT ? 'GPS timed out. Try again near a window, then tap Allow location.' : 'GPS is unavailable. Enable location services and try again.'))
    }
    const timeoutId = window.setTimeout(() => {
      if (best) return succeed(best)
      fail({ code: 3, TIMEOUT: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2 } as GeolocationPositionError)
    }, options.timeout || ACQUISITION_TIMEOUT_MS)

    watchId = navigator.geolocation.watchPosition(position => {
      const location = readingFrom(position)
      if (!best || location.accuracyMeters < best.accuracyMeters) best = location
      if (location.accuracyMeters <= TARGET_ACCURACY_METERS) succeed(location)
    }, fail, options)
  })
}

export async function getLocation(): Promise<DeviceLocation> {
  try {
    return await watchLocation({ enableHighAccuracy: true, timeout: ACQUISITION_TIMEOUT_MS, maximumAge: 0 })
  } catch (error) {
    try {
      return await watchLocation({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 30_000 })
    } catch {
      throw error instanceof Error ? error : new Error(permissionHelp())
    }
  }
}
