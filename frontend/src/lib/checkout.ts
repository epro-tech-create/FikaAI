export const MINIMUM_CHECKOUT_MINUTES = 30
const MINIMUM_CHECKOUT_MS = MINIMUM_CHECKOUT_MINUTES * 60 * 1000

export function checkoutWait(checkInAt: unknown, now = Date.now()) {
  if (typeof checkInAt !== 'string') return null
  const checkedInAt = new Date(checkInAt).getTime()
  if (!Number.isFinite(checkedInAt)) return null
  const availableAt = checkedInAt + MINIMUM_CHECKOUT_MS
  return {
    availableAt,
    remainingMs:Math.max(0,availableAt - now),
  }
}

export function earlyCheckoutMessage(checkInAt: unknown, now = Date.now()) {
  const wait = checkoutWait(checkInAt,now)
  if (!wait || wait.remainingMs === 0) return ''
  const minutes = Math.max(1,Math.ceil(wait.remainingMs / 60_000))
  return `Checkout is available ${MINIMUM_CHECKOUT_MINUTES} minutes after check-in. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
}
