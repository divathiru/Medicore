import { apiClient } from './client.js'

export const authApi = {
  signup: (data) => apiClient.post('/auth/signup', data).then((r) => r.data),
  login: (data) => apiClient.post('/auth/login', data).then((r) => r.data),
  me: () => apiClient.get('/auth/me').then((r) => r.data),
}
