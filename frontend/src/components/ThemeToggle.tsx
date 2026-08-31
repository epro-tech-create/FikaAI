import { useEffect, useState } from 'react'
import { getStoredTheme, setTheme, type Theme } from '../lib/theme'
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>('dark')
  useEffect(() => setThemeState(getStoredTheme()), [])
  const toggle = () => { const n: Theme = theme === 'dark' ? 'light' : 'dark'; setTheme(n); setThemeState(n) }
  return (
    <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} className={`theme-toggle mini compact ${className}`} type="button">
      <span className="theme-toggle-track compact"><i className={`theme-toggle-thumb ${theme}`} /><span className="theme-toggle-icon sun" aria-hidden>☀</span><span className="theme-toggle-icon moon" aria-hidden>☾</span></span>
    </button>
  )
}
