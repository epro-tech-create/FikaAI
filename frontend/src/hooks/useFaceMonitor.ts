import { useRef, useState, type RefObject } from 'react'
import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision'

export type FaceReading = {
  faceCount: number
  centered: boolean
  sizeOk: boolean
  ready: boolean
  yaw: number
  pitch: number
  blink: number
  smile: number
  hint: string
}

const EMPTY_READING: FaceReading = {
  faceCount: 0,
  centered: false,
  sizeOk: false,
  ready: false,
  yaw: 0,
  pitch: 0,
  blink: 0,
  smile: 0,
  hint: 'Position your face inside the circle',
}

let landmarkerPromise: Promise<FaceLandmarker> | null = null

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks('/mediapipe').then(fileset =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 2,
        minFaceDetectionConfidence: 0.6,
        minFacePresenceConfidence: 0.6,
        minTrackingConfidence: 0.55,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
    ).catch(error => {
      landmarkerPromise = null
      throw error
    })
  }
  return landmarkerPromise
}

function yawRatio(landmarks: NormalizedLandmark[]) {
  const nose = landmarks[1]
  const leftEye = landmarks[33]
  const rightEye = landmarks[263]
  const span = Math.abs(rightEye.x - leftEye.x)
  return span < 1e-6 ? 0 : ((nose.x - leftEye.x) - (rightEye.x - nose.x)) / span
}

function faceBounds(landmarks: NormalizedLandmark[]) {
  let minX = 1, maxX = 0, minY = 1, maxY = 0
  for (const point of landmarks) {
    minX = Math.min(minX,point.x); maxX = Math.max(maxX,point.x)
    minY = Math.min(minY,point.y); maxY = Math.max(maxY,point.y)
  }
  return { centerX:(minX + maxX) / 2, centerY:(minY + maxY) / 2, width:maxX - minX, height:maxY - minY }
}

function toReading(result: ReturnType<FaceLandmarker['detectForVideo']>): FaceReading {
  const faceCount = result.faceLandmarks.length
  if (faceCount !== 1) {
    return { ...EMPTY_READING, faceCount, hint:faceCount > 1 ? 'Only one person may be in the scanner' : EMPTY_READING.hint }
  }

  const landmarks = result.faceLandmarks[0]
  const bounds = faceBounds(landmarks)
  const centered = Math.abs(bounds.centerX - 0.5) < 0.12 && bounds.centerY > 0.4 && bounds.centerY < 0.61
  const sizeOk = bounds.width >= 0.28 && bounds.width <= 0.7 && bounds.height >= 0.35 && bounds.height <= 0.88
  const categories = new Map(
    (result.faceBlendshapes[0]?.categories || []).map(category => [category.categoryName,category.score]),
  )
  const matrix = result.facialTransformationMatrixes[0]?.data
  const pitch = matrix?.length >= 16 ? Math.atan2(matrix[9],matrix[10]) * 180 / Math.PI : 0
  let hint = 'Face locked — hold still'
  if (!centered) hint = bounds.centerX < 0.38 ? 'Move slightly to your right' : bounds.centerX > 0.62 ? 'Move slightly to your left' : 'Center your face vertically'
  else if (!sizeOk) hint = bounds.width < 0.28 ? 'Move closer to the camera' : 'Move slightly away from the camera'

  return {
    faceCount,
    centered,
    sizeOk,
    ready:centered && sizeOk,
    yaw:yawRatio(landmarks),
    pitch,
    blink:Math.max(categories.get('eyeBlinkLeft') || 0,categories.get('eyeBlinkRight') || 0),
    smile:Math.max(categories.get('mouthSmileLeft') || 0,categories.get('mouthSmileRight') || 0),
    hint,
  }
}

export function useFaceMonitor(video: RefObject<HTMLVideoElement | null>) {
  const [reading,setReading] = useState<FaceReading>(EMPTY_READING)
  const current = useRef<FaceReading>(EMPTY_READING)
  const animationFrame = useRef<number | null>(null)
  const running = useRef(false)

  async function start() {
    const landmarker = await loadLandmarker()
    running.current = true
    let lastVideoTime = -1
    let lastAnalysisAt = 0
    const analyze = () => {
      const element = video.current
      const now = performance.now()
      if (running.current && element?.readyState && element.currentTime !== lastVideoTime && now - lastAnalysisAt >= 70) {
        lastVideoTime = element.currentTime
        lastAnalysisAt = now
        const next = toReading(landmarker.detectForVideo(element,now))
        current.current = next
        setReading(next)
      }
      if (running.current) animationFrame.current = requestAnimationFrame(analyze)
    }
    analyze()
  }

  function stop() {
    running.current = false
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current)
    animationFrame.current = null
    current.current = EMPTY_READING
    setReading(EMPTY_READING)
  }

  return { reading, current, start, stop }
}
