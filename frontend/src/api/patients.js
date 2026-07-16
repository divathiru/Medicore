import { apiClient } from './client.js'

export const patientsApi = {
  getProfile: () => apiClient.get('/patients/me').then((r) => r.data),
  updateProfile: (data) => apiClient.put('/patients/me', data).then((r) => r.data),
  uploadSummary: (formData) =>
    apiClient
      .post('/patients/me/summaries', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
  bookAppointment: (data) =>
    apiClient.post('/patients/me/appointments', data).then((r) => r.data),
  getAppointments: () =>
    apiClient.get('/patients/me/appointments').then((r) => r.data),
}
