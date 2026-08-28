/**
 * Lightweight SEO helper - no external dependency to keep bundle small.
 * Used to set per-page title/meta and enforce noindex for private apps.
 */
export type SeoProps = {
  title?: string
  description?: string
  canonical?: string
  noindex?: boolean
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
}

const DEFAULT_TITLE = 'CCD-Attendance — Secure Student Attendance System with Face ID & GPS Geofence | DIT Tanzania'
const DEFAULT_DESC =
  'CCD-Attendance is the secure student attendance system for DIT & universities in Tanzania. GPS geofence + live Face ID verification — fast, private & fraud-proof.'

function upsertMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

export function applySeo({ title, description, canonical, noindex, ogTitle, ogDescription, ogImage }: SeoProps) {
  if (title) document.title = title
  else if (!document.title || document.title === 'CCD-Attendance') document.title = DEFAULT_TITLE

  const desc = description ?? DEFAULT_DESC
  upsertMeta('description', desc)
  upsertMeta('og:description', ogDescription ?? desc, 'property')
  upsertMeta('og:title', ogTitle ?? title ?? DEFAULT_TITLE, 'property')
  upsertMeta('twitter:title', ogTitle ?? title ?? DEFAULT_TITLE)
  upsertMeta('twitter:description', ogDescription ?? desc)
  if (ogImage) {
    upsertMeta('og:image', ogImage, 'property')
    upsertMeta('twitter:image', ogImage)
  }

  if (canonical) upsertLink('canonical', canonical)

  // private apps must not be indexed - prevents duplicate content for 'attendance' keyword
  const robotsContent = noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'
  upsertMeta('robots', robotsContent)
  upsertMeta('googlebot', robotsContent)
}

export function seoForApplication(application: string): SeoProps {
  if (application === 'admin') {
    return {
      title: 'Admin Console — CCD-Attendance | Attendance Management',
      description: 'Administrator attendance management console for CCD-Attendance. Manage courses, students and attendance records.',
      noindex: true,
    }
  }
  if (application === 'instructor') {
    return {
      title: 'Instructor Portal — CCD-Attendance | Manage Attendance Sessions',
      description: 'Instructor attendance portal for CCD-Attendance. Create sessions and track verified student attendance.',
      noindex: true,
    }
  }
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    canonical: 'https://attendance.cyberclubdit.org/',
    noindex: false,
  }
}
