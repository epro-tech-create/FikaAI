export const CHALLENGE_TYPES = ['BLINK_TWICE', 'TURN_LEFT', 'TURN_RIGHT', 'SMILE', 'LOOK_STRAIGHT'] as const

export type ChallengeType = typeof CHALLENGE_TYPES[number]

export type ReadingMetadata = {
  analyzedAt: number
  videoTime: number
  sequence: number
}

export type LightingAssessment = {
  brightness: number
  contrast: number
  lightingOk: boolean
  lightingHint: string
}

const MAX_READING_AGE_MS = 400

export function parseChallengeType(value: unknown): ChallengeType {
  if (typeof value !== 'string' || !CHALLENGE_TYPES.includes(value as ChallengeType)) {
    throw new Error('The server returned an unsupported face challenge. Please restart the scan.')
  }
  return value as ChallengeType
}

export function isFreshReading(reading: ReadingMetadata, lastSequence: number, now = performance.now()) {
  return reading.sequence > lastSequence
    && reading.videoTime >= 0
    && now - reading.analyzedAt >= 0
    && now - reading.analyzedAt <= MAX_READING_AGE_MS
}

export function isContinuousReading(reading: ReadingMetadata, previousAnalyzedAt: number, maxGapMs = 350) {
  return previousAnalyzedAt === 0 || reading.analyzedAt - previousAnalyzedAt <= maxGapMs
}

export function assessFaceLighting(pixels: Uint8ClampedArray): LightingAssessment {
  if (pixels.length < 4) return { brightness:0, contrast:0, lightingOk:false, lightingHint:'Move to a well-lit area' }

  let sum = 0
  let sumSquares = 0
  let count = 0
  for (let index=0; index + 3<pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue
    const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
    sum += luminance
    sumSquares += luminance * luminance
    count += 1
  }
  if (!count) return { brightness:0, contrast:0, lightingOk:false, lightingHint:'Move to a well-lit area' }

  const brightness = sum / count
  const contrast = Math.sqrt(Math.max(0,sumSquares / count - brightness * brightness))
  if (brightness < 52) return { brightness,contrast,lightingOk:false,lightingHint:'Too dark — face a light or move to a brighter area' }
  if (brightness > 225) return { brightness,contrast,lightingOk:false,lightingHint:'Too bright — move away from direct light' }
  if (contrast < 12) return { brightness,contrast,lightingOk:false,lightingHint:'Add light in front of your face, not behind you' }
  return { brightness,contrast,lightingOk:true,lightingHint:'' }
}
