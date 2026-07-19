import axios from 'axios'

// In the Docker-built image, VITE_API_BASE_URL is intentionally not set.
// All API calls use relative paths (e.g. /auth/login) so nginx can proxy them
// to main-website:4000 inside the container network — works from any host/IP.
// For local dev with `npm run dev`, set VITE_API_BASE_URL=http://localhost:4000
// in frontend/.env so the Vite dev server can reach the gateway directly.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// Attach JWT from localStorage on every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('mc_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Normalize error responses
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.error ||
      err.response?.data?.detail ||
      err.message ||
      'An unknown error occurred.'
    return Promise.reject(new Error(message))
  }
)
