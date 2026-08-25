import { useRef } from 'react'

export function useCameraFrames() {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available in this browser.')
    stream.current = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'user', width:{ideal:640}, height:{ideal:480}, frameRate:{ideal:24,max:30} },
      audio:false,
    })
    for (let i=0; i<20 && !video.current; i++) await new Promise(requestAnimationFrame)
    if (!video.current) throw new Error('Camera preview could not be opened.')
    video.current.srcObject = stream.current
    await video.current.play()
    await new Promise<void>(resolve => {
      if (video.current?.videoWidth) resolve()
      else video.current?.addEventListener('loadedmetadata',() => resolve(),{once:true})
    })
  }

  function grabFrame() {
    const element = video.current
    if (!element?.videoWidth) throw new Error('Camera frame is not ready.')
    const canvas = document.createElement('canvas')
    canvas.width = element.videoWidth
    canvas.height = element.videoHeight
    canvas.getContext('2d')!.drawImage(element,0,0,canvas.width,canvas.height)
    return canvas.toDataURL('image/jpeg',.88)
  }

  function stop() {
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
  }

  return { video, start, grabFrame, stop }
}
