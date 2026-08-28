import { describe, expect, it } from 'vitest'
import { checkoutWindow } from './checkout'

describe('scheduled checkout window', () => {
  const opensAt = '2026-08-26T14:00:00+03:00'
  const closesAt = '2026-08-26T16:00:00+03:00'

  it('is locked before 14:00 campus time', () => {
    expect(checkoutWindow(opensAt,closesAt,new Date('2026-08-26T10:59:59Z').getTime())?.state).toBe('before')
  })

  it('is open from 14:00 through the 16:00 boundary', () => {
    expect(checkoutWindow(opensAt,closesAt,new Date('2026-08-26T11:00:00Z').getTime())?.state).toBe('open')
    expect(checkoutWindow(opensAt,closesAt,new Date('2026-08-26T13:00:00Z').getTime())?.state).toBe('open')
  })

  it('is closed after 16:00 campus time', () => {
    expect(checkoutWindow(opensAt,closesAt,new Date('2026-08-26T13:00:01Z').getTime())?.state).toBe('closed')
  })
})
