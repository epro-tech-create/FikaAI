import { describe, expect, it } from 'vitest'
import { areaPath, chartBottom, chartLeft, chartPoints, chartRight, emptyWeek, splinePath } from './DashboardPage'

function pathYs(path: string) {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number).filter((_, index) => index % 2 === 1)
}

describe('weekly attendance spline', () => {
  it('plots Monday through Friday at equal spacing', () => {
    const points = chartPoints(emptyWeek(), 'arrivals', 1)
    expect(points).toHaveLength(5)
    expect(points[0].x).toBe(chartLeft)
    expect(points[4].x).toBe(chartRight)
  })

  it('draws a curved path instead of straight segments', () => {
    const path = splinePath(chartPoints([
      { day: 'Mon', date: '2026-08-31', arrivals: 4, departures: 1 },
      { day: 'Tue', date: '2026-09-01', arrivals: 12, departures: 8 },
      { day: 'Wed', date: '2026-09-02', arrivals: 7, departures: 6 },
      { day: 'Thu', date: '2026-09-03', arrivals: 15, departures: 9 },
      { day: 'Fri', date: '2026-09-04', arrivals: 9, departures: 9 },
    ], 'arrivals', 15))

    expect(path.startsWith('M ')).toBe(true)
    expect(path).toContain(' C ')
    expect(path.includes(' L ')).toBe(false)
  })

  it('closes the brand fill under the spline', () => {
    const line = splinePath([{ x: 48, y: 100 }, { x: 200, y: 80 }, { x: 400, y: 120 }])
    const fill = areaPath(line)
    expect(fill.endsWith(' Z')).toBe(true)
    expect(fill).toContain(`L ${chartRight.toFixed(1)}`)
    expect(areaPath('')).toBe('')
  })

  it('does not draw the curve below the zero line', () => {
    const path = splinePath(chartPoints([
      { day: 'Mon', date: '2026-08-31', arrivals: 1, departures: 0 },
      { day: 'Tue', date: '2026-09-01', arrivals: 0, departures: 0 },
      { day: 'Wed', date: '2026-09-02', arrivals: 0, departures: 0 },
      { day: 'Thu', date: '2026-09-03', arrivals: 0, departures: 0 },
      { day: 'Fri', date: '2026-09-04', arrivals: 0, departures: 0 },
    ], 'arrivals', 1))
    expect(Math.max(...pathYs(path))).toBeLessThanOrEqual(chartBottom)
  })
})
