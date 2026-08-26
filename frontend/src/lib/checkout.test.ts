import { describe, expect, it } from 'vitest'
import { checkoutWait, earlyCheckoutMessage } from './checkout'

describe('checkout minimum stay', () => {
  const checkInAt = '2026-08-26T08:00:00.000Z'

  it('returns an immediate countdown before three hours', () => {
    const now = new Date('2026-08-26T08:12:00.000Z').getTime()

    expect(checkoutWait(checkInAt,now)?.remainingMs).toBe(168 * 60 * 1000)
    expect(earlyCheckoutMessage(checkInAt,now)).toContain('Try again in 168 minutes')
  })

  it('allows checkout once three hours have elapsed', () => {
    const now = new Date('2026-08-26T11:00:00.000Z').getTime()

    expect(checkoutWait(checkInAt,now)?.remainingMs).toBe(0)
    expect(earlyCheckoutMessage(checkInAt,now)).toBe('')
  })
})
