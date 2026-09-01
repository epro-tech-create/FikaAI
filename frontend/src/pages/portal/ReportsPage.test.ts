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

    expect(csv).toContain('Student name,Student ID,Registration number,Arrival time,Checkout time')
    expect(csv).toContain('"Doe, John",,240001,08:10:00,11:15:00')
  })

  it('adds weekday columns for weekly and monthly exports', () => {
    const csv = attendanceCsv([{
      id: '1',
      day: 'Mon',
      date: '2026-08-31',
      studentName: 'Asha K',
      registrationNumber: '240002',
      arrivedAt: '2026-08-31T05:10:00Z',
      checkedOutAt: null,
      status: 'PRESENT',
    }], 'weekly')

    expect(csv).toContain('Student name,Student ID,Registration number,Day,Date,Arrival time,Checkout time,Status')
    expect(csv).toContain('Asha K,,240002,Mon,2026-08-31,08:10:00,,Arrived early')
  })
})
