/**
 * Google SEO analytics helper - GA4 + Search Console friendly.
 * Reads Vite env vars injected at build time.
 * Safe to call multiple times; no-ops if measurement ID not set.
 */

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
const GOOGLE_VERIFICATION = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION as string | undefined

function isValidGaId(id: string) {
  return /^G-[A-Z0-9]{7,}$/.test(id) || /^AW-/.test(id) || /^GT-/.test(id)
}

export function initGoogleAnalytics() {
  // 1. Inject Search Console verification meta if provided via env (overrides placeholder in index.html)
  if (GOOGLE_VERIFICATION && GOOGLE_VERIFICATION !== 'REPLACE_WITH_GOOGLE_VERIFICATION_TOKEN') {
    let meta = document.querySelector('meta[name="google-site-verification"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'google-site-verification'
      document.head.appendChild(meta)
    }
    meta.content = GOOGLE_VERIFICATION
  }

  // 2. Init GA4 if valid ID provided
  if (!GA_ID || !isValidGaId(GA_ID)) return

  // If index.html already loaded gtag with placeholder, re-config with real ID
  if (typeof window.gtag === 'function') {
    window.gtag('config', GA_ID, {
      send_page_view: true,
      anonymize_ip: true,
      cookie_flags: 'SameSite=None;Secure',
    })
  } else {
    // Fallback: inject gtag script dynamically (rare - index.html already does)
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
    document.head.appendChild(script)
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments as unknown as never)
    }
    window.gtag('js', new Date())
    window.gtag('config', GA_ID, { send_page_view: true, anonymize_ip: true })
  }
}

export function trackPageView(path: string, title?: string) {
  if (!GA_ID || !isValidGaId(GA_ID) || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: `https://attendance.cyberclubdit.org${path}`,
  })
}

export function trackEvent(action: string, params: Record<string, unknown> = {}) {
  if (!GA_ID || typeof window.gtag !== 'function') return
  window.gtag('event', action, params)
}
