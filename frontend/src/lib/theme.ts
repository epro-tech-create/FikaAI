export type Theme = 'light' | 'dark'
const KEY = 'ccd.theme'
const ATTR = 'data-theme'
function sysPref(): Theme { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' }
export function getStoredTheme(): Theme { const v = localStorage.getItem(KEY) as Theme | null; return v === 'light' || v === 'dark' ? v : sysPref() }
export function applyTheme(t: Theme) { document.documentElement.setAttribute(ATTR, t); document.documentElement.style.colorScheme = t; const m = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null; if (m) m.content = t === 'light' ? '#f8fafc' : '#070c10' }
export function initTheme() { applyTheme(getStoredTheme()); window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => { if (!localStorage.getItem(KEY)) applyTheme(e.matches ? 'light' : 'dark') }) }
export function setTheme(t: Theme) { localStorage.setItem(KEY, t); applyTheme(t) }
export function toggleTheme(): Theme { const n: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark'; setTheme(n); return n }
