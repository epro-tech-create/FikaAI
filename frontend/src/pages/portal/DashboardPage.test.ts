import { describe, expect, it } from 'vitest'
import { chartBottom, chartLeft, chartPath, chartPolyline, chartRight, emptyTimeline } from './DashboardPage'

function pathYs(path: string) {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number).filter((_, index) => index % 2 === 1)
}

describe('daily attendance chart', () => {
  it('plots 08:00 through 16:00 at equal spacing', () => {
    const timeline = emptyTimeline()
    expect(timeline).toHaveLength(17)
    expect(timeline[0].time).toBe('08:00')
    expect(timeline[timeline.length - 1]?.time).toBe('16:00')
    const path = chartPath(timeline, 'arrivals', 1)
    expect(path.startsWith(`M ${chartLeft.toFixed(1)}`)).toBe(true)
    expect(path).toContain(`L ${chartRight.toFixed(1)}`)
  })

  it('draws check-in and check-out as separate lines', () => {
    const series = emptyTimeline().map((point, index) => ({
      ...point,
      arrivals: index,
      departures: Math.max(0, index - 4),
    }))
    const arrivals = chartPath(series, 'arrivals', 16)
    const departures = chartPath(series, 'departures', 16)
    expect(arrivals.startsWith('M ')).toBe(true)
    expect(arrivals).toContain(' L ')
    expect(departures).toContain(' L ')
    expect(arrivals).not.toBe(departures)
  })

  it('does not draw below the zero line', () => {
    const series = emptyTimeline().map((point, index) => ({ ...point, arrivals: index === 0 ? 1 : 0, departures: 0 }))
    const path = chartPath(series, 'arrivals', 1)
    expect(Math.max(...pathYs(path))).toBeLessThanOrEqual(chartBottom)
  })

  it('uses straight segments instead of curves', () => {
    const series = emptyTimeline().map((point, index) => ({ ...point, arrivals: index, departures: index }))
    const path = chartPath(series, 'arrivals', 16)
    const polyline = chartPolyline(series, 'arrivals', 16)
    expect(path).not.toMatch(/[CSQTA]/)
    expect(polyline).toMatch(/^\d+\.\d+,\d+\.\d+( \d+\.\d+,\d+\.\d+)+$/)
  })
})
