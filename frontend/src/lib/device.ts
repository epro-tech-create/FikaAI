const REGISTRATION_DEVICE_KEY = 'fikaai.registration-device'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function getRegistrationDeviceId() {
  const existing = localStorage.getItem(REGISTRATION_DEVICE_KEY)
  if (existing && UUID_PATTERN.test(existing)) return existing
  const deviceId = crypto.randomUUID()
  localStorage.setItem(REGISTRATION_DEVICE_KEY,deviceId)
  return deviceId
}
