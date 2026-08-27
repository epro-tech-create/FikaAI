import { describe, expect, it } from 'vitest'
import { courseFormError, normalizeCourseCode } from './CoursePage'

describe('course form', () => {
  it('normalizes course codes', () => {
    expect(normalizeCourseCode(' cs401 ')).toBe('CS401')
  })

  it('requires a code and title', () => {
    expect(courseFormError({ code: '', title: 'Applied Cybersecurity' })).toContain('code')
    expect(courseFormError({ code: 'CS401', title: '  ' })).toContain('title')
    expect(courseFormError({ code: 'cs401', title: 'Applied Cybersecurity' })).toBe('')
  })
})
