import axios from 'axios'
import { clearAuthentication } from '../lib/auth'
export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api' })
api.interceptors.request.use((config) => { const token = localStorage.getItem('fikaai.access'); if (token) config.headers.Authorization = `Bearer ${token}`; return config })
api.interceptors.response.use(response => response,error => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && localStorage.getItem('fikaai.access')) {
    clearAuthentication()
    window.location.assign('/login')
  }
  return Promise.reject(error)
})
export function message(error: unknown) {
  if (axios.isAxiosError(error)) {
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
