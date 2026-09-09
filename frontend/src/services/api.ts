import axios from 'axios'
import { clearAuthentication } from '../lib/auth'
import { loginPathPreservingVenue } from '../lib/venueCheckin'
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
  withCredentials: false, // set true when backend moves to httpOnly cookies
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
})
api.interceptors.request.use((config) => { const token = localStorage.getItem('ccd.access') ?? localStorage.getItem('fikaai.access'); if (token) config.headers.Authorization = `Bearer ${token}`; return config })
api.interceptors.response.use(response => response, async error => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && (localStorage.getItem('ccd.access') || localStorage.getItem('fikaai.access'))) {
    clearAuthentication()
    window.location.assign(loginPathPreservingVenue())
  }
  // 429 burst retry with jitter — 60 phones behind one campus NAT hit the same IP bucket
  if (axios.isAxiosError(error) && error.response?.status === 429) {
    const cfg: any = error.config
    cfg.__retry429 = cfg.__retry429 ?? 0
    if (cfg.__retry429 < 2) {
      cfg.__retry429 += 1
      const delay = 400 + Math.random() * 800 * cfg.__retry429
      await new Promise(r => setTimeout(r, delay))
      return api.request(cfg)
    }
  }
  return Promise.reject(error)
})
export function message(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 429) return 'Too many requests at once (whole class scanning). Wait 10–20 seconds and tap again — your spot is not lost.'
    const apiMessage = error.response?.data?.error?.message
    if (apiMessage) return apiMessage
    if (!error.response) return 'Cannot reach the backend. Check that it is running and try again.'
    return `Request failed (${error.response.status}). Please retry.`
  }
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access in your browser and retry.'
    if (error.name === 'NotFoundError') return 'No usable camera was found on this device.'
    if (error.name === 'NotReadableError') return 'The camera is already being used by another application.'
    return error.message || 'The camera could not be opened.'
  }
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please retry.'
}
