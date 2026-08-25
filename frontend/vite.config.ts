import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PORTS = { student: 5173, admin: 5174, instructor: 5175 } as const

export default defineConfig(({ mode }) => {
  const application = mode in PORTS ? (mode as keyof typeof PORTS) : 'student'
  return {
    plugins: [react()],
    define: { 'import.meta.env.VITE_APP_ROLE': JSON.stringify(application) },
    server: {
      host: '0.0.0.0',
      port: PORTS[application],
      proxy: { '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000' },
    },
  }
})
