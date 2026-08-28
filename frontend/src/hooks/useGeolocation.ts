type DeviceLocation = { latitude:number; longitude:number; accuracyMeters:number; capturedAt:string }

const TARGET_ACCURACY_METERS = 30
const ACQUISITION_TIMEOUT_MS = 12_000

export function getLocation(): Promise<DeviceLocation> {
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
      reject(new Error(error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Enable precise location for this site.' : error.code === error.TIMEOUT ? 'GPS timed out. Try again near a window or in an open area.' : 'GPS is unavailable. Enable location services and try again.'))
    }
    const timeoutId = window.setTimeout(() => {
      if (best) return succeed(best)
      fail({ code: 3, TIMEOUT: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2 } as GeolocationPositionError)
    }, ACQUISITION_TIMEOUT_MS)

    watchId = navigator.geolocation.watchPosition(position => {
      const location = {
        latitude:position.coords.latitude,
        longitude:position.coords.longitude,
        accuracyMeters:position.coords.accuracy,
        capturedAt:new Date(position.timestamp || Date.now()).toISOString(),
      }
      if (!best || location.accuracyMeters < best.accuracyMeters) best = location
      if (location.accuracyMeters <= TARGET_ACCURACY_METERS) succeed(location)
    }, fail, { enableHighAccuracy:true, timeout:ACQUISITION_TIMEOUT_MS, maximumAge:0 })
  })
}
