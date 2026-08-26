// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INACTIVITY_TIMEOUT_MS, startInactivityTimer } from './inactivity'

describe('inactivity timer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('logs out after two minutes without activity', () => {
    const onTimeout = vi.fn()
    const stop = startInactivityTimer(onTimeout)

    vi.advanceTimersByTime(INACTIVITY_TIMEOUT_MS)

    expect(onTimeout).toHaveBeenCalledOnce()
    stop()
  })

  it('restarts the countdown after user activity', () => {
    const onTimeout = vi.fn()
    const stop = startInactivityTimer(onTimeout)
    vi.advanceTimersByTime(90_000)

    window.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(90_000)
    expect(onTimeout).not.toHaveBeenCalled()

    vi.advanceTimersByTime(30_000)
    expect(onTimeout).toHaveBeenCalledOnce()
    stop()
  })
})
