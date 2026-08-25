import { useRef } from 'react'

const STARTUP_TIMEOUT_MS = 10000

function withTimeout<T>(promise: Promise<T>, message: string) {
  return new Promise<T>((resolve,reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)),STARTUP_TIMEOUT_MS)
    promise.then(value => { window.clearTimeout(timer); resolve(value) },error => { window.clearTimeout(timer); reject(error) })
  })
}

export function useCameraFrames() {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const problem = useRef<Error | null>(null)
  const settings = useRef<MediaTrackSettings | null>(null)
  const mutedTimer = useRef<number | null>(null)
  const stopping = useRef(false)

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available in this browser.')
    stop()
    stopping.current = false
    problem.current = null
    const mediaPromise = navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'user', width:{ideal:640}, height:{ideal:480}, frameRate:{ideal:24,max:30} },
      audio:false,
    })
    try {
      stream.current = await withTimeout(mediaPromise,'Camera startup timed out. Close other camera apps and try again.')
    } catch (error) {
      mediaPromise.then(lateStream => lateStream.getTracks().forEach(track => track.stop())).catch(() => undefined)
      throw error
    }
    const track = stream.current.getVideoTracks()[0]
    if (!track) { stop(); throw new Error('No camera video track was provided.') }
    settings.current = track.getSettings()
    track.addEventListener('ended',() => {
      if (!stopping.current) problem.current = new Error('Camera disconnected. Reopen the scanner and try again.')
    })
    track.addEventListener('mute',() => {
      if (mutedTimer.current) window.clearTimeout(mutedTimer.current)
      mutedTimer.current = window.setTimeout(() => {
        if (!stopping.current && track.muted) problem.current = new Error('Camera video paused. Check camera access and try again.')
      },1500)
    })
    track.addEventListener('unmute',() => {
      if (mutedTimer.current) window.clearTimeout(mutedTimer.current)
      mutedTimer.current = null
    })
    try {
      await withTimeout((async () => {
        for (let i=0; i<60 && !video.current; i++) await new Promise(requestAnimationFrame)
        if (!video.current) throw new Error('Camera preview could not be opened.')
        video.current.srcObject = stream.current
        await video.current.play()
        if (!video.current.videoWidth) await new Promise<void>(resolve => video.current?.addEventListener('loadedmetadata',() => resolve(),{once:true}))
      })(),'Camera preview did not start. Check camera access and try again.')
    } catch (error) {
      stop()
      throw error
    }
  }

  function grabFrame(afterVideoTime = -1) {
    const element = video.current
    if (!element?.videoWidth) throw new Error('Camera frame is not ready.')
    if (element.currentTime <= afterVideoTime) throw new Error('A fresh camera frame is not available yet.')
    const canvas = document.createElement('canvas')
    const scale = Math.min(1,640 / element.videoWidth)
    canvas.width = Math.round(element.videoWidth * scale)
    canvas.height = Math.round(element.videoHeight * scale)
    canvas.getContext('2d')!.drawImage(element,0,0,canvas.width,canvas.height)
    return { dataUrl:canvas.toDataURL('image/jpeg',.84),videoTime:element.currentTime }
  }

  function stop() {
    stopping.current = true
    if (mutedTimer.current) window.clearTimeout(mutedTimer.current)
    mutedTimer.current = null
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    settings.current = null
    if (video.current) video.current.srcObject = null
  }

  return { video,stream,problem,settings,start,grabFrame,stop }
}
