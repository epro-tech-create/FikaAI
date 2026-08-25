export function getLocation(): Promise<{ latitude:number; longitude:number; accuracyMeters:number; capturedAt:string }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS is not available on this device.'))
    navigator.geolocation.getCurrentPosition(p => resolve({ latitude:p.coords.latitude, longitude:p.coords.longitude, accuracyMeters:p.coords.accuracy, capturedAt:new Date().toISOString() }), e => reject(new Error(e.code === 1 ? 'Location permission was denied.' : e.code === 3 ? 'GPS timed out. Try again in an open area.' : 'GPS is unavailable.')), { enableHighAccuracy:true, timeout:15000, maximumAge:0 })
  })
}
