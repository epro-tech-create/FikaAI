import { describe, expect, it } from 'vitest'
import { attendanceCsv } from './ReportsPage'

describe('attendance CSV export', () => {
  it('includes required report columns and escapes names', () => {
    const csv = attendanceCsv([{
      id: '1',
      studentName: 'Doe, John',
      registrationNumber: '240001',
      arrivedAt: '2026-08-28T05:10:00Z',
      checkedOutAt: '2026-08-28T08:15:00Z',
      status: 'CHECKED_OUT',
    }])

    expect(csv).toContain('Student name,Registration number,Arrival time,Checkout time')
    expect(csv).toContain('"Doe, John",240001,08:10:00,11:15:00')
  })
})
