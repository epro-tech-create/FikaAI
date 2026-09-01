import { describe, expect, it } from 'vitest'
import { areaPath, chartBottom, chartLeft, chartPoints, chartRight, emptyTimeline, splinePath } from './DashboardPage'

function pathYs(path: string) {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number).filter((_, index) => index % 2 === 1)
}

describe('daily attendance chart', () => {
  it('plots 08:00 through 16:00 at equal spacing', () => {
    const points = chartPoints(emptyTimeline(), 'arrivals', 1)
    expect(emptyTimeline()).toHaveLength(17)
    expect(emptyTimeline()[0].time).toBe('08:00')
    expect(emptyTimeline()[emptyTimeline().length - 1]?.time).toBe('16:00')
    expect(points[0].x).toBe(chartLeft)
    expect(points[points.length - 1]?.x).toBe(chartRight)
  })

  it('draws check-in and check-out as separate curves', () => {
    const series = emptyTimeline().map((point, index) => ({
      ...point,
      arrivals: index,
      departures: Math.max(0, index - 4),
    }))
    const arrivals = splinePath(chartPoints(series, 'arrivals', 16))
    const departures = splinePath(chartPoints(series, 'departures', 16))
    expect(arrivals).toContain(' C ')
    expect(departures).toContain(' C ')
    expect(arrivals).not.toBe(departures)
  })

  it('closes the brand fill under the spline', () => {
    const line = splinePath([{ x: 48, y: 100 }, { x: 200, y: 80 }, { x: 400, y: 120 }])
    const fill = areaPath(line)
    expect(fill.endsWith(' Z')).toBe(true)
    expect(fill).toContain(`L ${chartRight.toFixed(1)}`)
    expect(areaPath('')).toBe('')
  })

  it('does not draw the curve below the zero line', () => {
    const series = emptyTimeline().map((point, index) => ({ ...point, arrivals: index === 0 ? 1 : 0, departures: 0 }))
    const path = splinePath(chartPoints(series, 'arrivals', 1))
    expect(Math.max(...pathYs(path))).toBeLessThanOrEqual(chartBottom)
  })
})
