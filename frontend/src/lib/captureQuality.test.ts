import { describe,expect,it } from 'vitest'
import { assessFaceLighting,isContinuousReading,isFreshReading,parseChallengeType } from './captureQuality'

function grayscalePixels(values:number[]) {
  return new Uint8ClampedArray(values.flatMap(value => [value,value,value,255]))
}

describe('parseChallengeType',() => {
  it('accepts only supported challenge values',() => {
    expect(parseChallengeType('BLINK_TWICE')).toBe('BLINK_TWICE')
    expect(parseChallengeType('LOOK_STRAIGHT')).toBe('LOOK_STRAIGHT')
  })

  it.each([undefined,null,'','blink_twice','UNKNOWN',42])('rejects missing or unknown value %s',value => {
    expect(() => parseChallengeType(value)).toThrow(/unsupported face challenge/i)
  })
})

describe('reading freshness',() => {
  const reading = { analyzedAt:1000,videoTime:2.5,sequence:8 }

  it('requires a new sequence within the age limit',() => {
    expect(isFreshReading(reading,7,1200)).toBe(true)
    expect(isFreshReading(reading,8,1200)).toBe(false)
    expect(isFreshReading(reading,7,1500)).toBe(false)
  })

  it('rejects discontinuous analysis gaps',() => {
    expect(isContinuousReading(reading,700)).toBe(true)
    expect(isContinuousReading(reading,649)).toBe(false)
  })
})

describe('face-region lighting',() => {
  it('identifies dark and flat face crops with actionable guidance',() => {
    const dark = assessFaceLighting(grayscalePixels([25,30,35,40]))
    expect(dark.lightingOk).toBe(false)
    expect(dark.lightingHint).toMatch(/too dark/i)

    const flat = assessFaceLighting(grayscalePixels([120,121,120,121]))
    expect(flat.lightingOk).toBe(false)
    expect(flat.lightingHint).toMatch(/light in front/i)
  })

  it('accepts a moderately bright crop with useful contrast',() => {
    const assessment = assessFaceLighting(grayscalePixels([75,100,130,165,190]))
    expect(assessment.lightingOk).toBe(true)
    expect(assessment.brightness).toBeGreaterThan(100)
    expect(assessment.contrast).toBeGreaterThan(12)
  })
})
