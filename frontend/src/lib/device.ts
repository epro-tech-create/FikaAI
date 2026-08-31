const REGISTRATION_DEVICE_KEY = 'ccd.registration-device'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function getRegistrationDeviceId() {
  const existing = localStorage.getItem(REGISTRATION_DEVICE_KEY) ?? localStorage.getItem('fikaai.registration-device')
  if (existing && UUID_PATTERN.test(existing)) {
    if (!localStorage.getItem(REGISTRATION_DEVICE_KEY)) localStorage.setItem(REGISTRATION_DEVICE_KEY, existing)
    return existing
  }
  const deviceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : fallbackUuid()
  localStorage.setItem(REGISTRATION_DEVICE_KEY,deviceId)
  return deviceId
}

function fallbackUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2,'0'))
  return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10).join('')}`
}
