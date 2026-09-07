import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PORTS = { student: 5173, admin: 5174, instructor: 5175 } as const

export default defineConfig(({ mode }) => {
  const application = mode in PORTS ? (mode as keyof typeof PORTS) : 'student'
  return {
    plugins: [
      react(),
      {
        name: 'google-seo-inject',
        transformIndexHtml(html) {
          const ga = process.env.VITE_GA_MEASUREMENT_ID || ''
          const verif = process.env.VITE_GOOGLE_SITE_VERIFICATION || ''
          let out = html
          const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
          if (ga && /^G-[A-Z0-9]{4,}$/.test(ga)) {
            const safeGa = escapeAttr(ga)
            out = out.replace('content="REPLACE_WITH_GOOGLE_VERIFICATION_TOKEN"', `content="REPLACE_WITH_GOOGLE_VERIFICATION_TOKEN"`) // keep placeholder safe
            out = out.replace('src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"', `src="https://www.googletagmanager.com/gtag/js?id=${safeGa}"`)
            out = out.replace("gtag('config', 'G-XXXXXXXXXX'", `gtag('config', '${safeGa}'`)
          }
          if (verif && verif !== 'REPLACE_WITH_GOOGLE_VERIFICATION_TOKEN') {
            const safeVerif = escapeAttr(verif)
            out = out.replace('content="REPLACE_WITH_GOOGLE_VERIFICATION_TOKEN"', `content="${safeVerif}"`)
          }
          return out
        },
      },
    ],
    define: { 'import.meta.env.VITE_APP_ROLE': JSON.stringify(application) },
    server: {
      host: '0.0.0.0',
      port: PORTS[application],
      proxy: { '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000' },
    },
  }
})
