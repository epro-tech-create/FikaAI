export function displayMembershipId(item: { membershipId?: string | null }) {
  const value = item.membershipId?.trim()
  return value ? value : '—'
}

export function displayRegistration(item: { registrationNumber?: string | null }) {
  const value = item.registrationNumber?.trim()
  return value ? value : '—'
}

export function normalizeMembershipIdInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12)
}

export function membershipIdError(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '')
  if (!normalized) return ''
  if (!/^CCD-\d{4}-\d{3}$/.test(normalized)) return 'Student ID must look like CCD-2026-015.'
  return ''
}
