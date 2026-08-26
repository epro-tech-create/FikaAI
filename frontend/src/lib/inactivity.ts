export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000

const ACTIVITY_EVENTS = ['pointerdown','pointermove','keydown','touchstart','scroll'] as const

export function startInactivityTimer(onTimeout: () => void, timeoutMs = INACTIVITY_TIMEOUT_MS) {
  let lastActivity = Date.now()
  let timer = 0
  let stopped = false

  function stop() {
    if (stopped) return
    stopped = true
    window.clearTimeout(timer)
    for (const eventName of ACTIVITY_EVENTS) window.removeEventListener(eventName,markActivity)
    document.removeEventListener('visibilitychange',checkElapsed)
  }

  function checkElapsed() {
    const remaining = timeoutMs - (Date.now() - lastActivity)
    if (remaining <= 0) {
      stop()
      onTimeout()
      return
    }
    window.clearTimeout(timer)
    timer = window.setTimeout(checkElapsed,remaining)
  }

  function markActivity() {
    lastActivity = Date.now()
    window.clearTimeout(timer)
    timer = window.setTimeout(checkElapsed,timeoutMs)
  }

  for (const eventName of ACTIVITY_EVENTS) window.addEventListener(eventName,markActivity,{ passive:true })
  document.addEventListener('visibilitychange',checkElapsed)
  timer = window.setTimeout(checkElapsed,timeoutMs)
  return stop
}
