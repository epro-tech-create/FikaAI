import { useEffect, useState } from 'react'

export function useCampusClock() {
  const [clock,setClock] = useState(() => new Date())

  useEffect(() => {
    const update = () => setClock(new Date())
    const timer = window.setInterval(update,1000)
    window.addEventListener('focus',update)
    document.addEventListener('visibilitychange',update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus',update)
      document.removeEventListener('visibilitychange',update)
    }
  },[])

  return clock
}
