export type CheckoutWindow = {
  state:'before' | 'open' | 'closed'
  opensAt:number
  closesAt:number
}

export function checkoutWindow(opensAt: unknown, closesAt: unknown, now = Date.now()): CheckoutWindow | null {
  if (typeof opensAt !== 'string' || typeof closesAt !== 'string') return null
  const opening = new Date(opensAt).getTime()
  const closing = new Date(closesAt).getTime()
  if (!Number.isFinite(opening) || !Number.isFinite(closing) || closing < opening) return null
  return {
    state:now < opening ? 'before' : now > closing ? 'closed' : 'open',
    opensAt:opening,
    closesAt:closing,
  }
}
