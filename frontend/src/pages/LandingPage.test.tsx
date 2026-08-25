import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LandingPage from './LandingPage'

describe('landing page', () => {
  it('links visitors to the student and instructor sign-in pages', () => {
    const html = renderToStaticMarkup(<MemoryRouter><LandingPage instructorLoginUrl="https://instructor.example.com/login"/></MemoryRouter>)
    expect(html).toContain('href="/login"')
    expect(html).toContain('Sign in as Student')
    expect(html).toContain('href="https://instructor.example.com/login"')
    expect(html).toContain('Sign in as Instructor')
    expect(html).toContain('href="/signup"')
  })
})
