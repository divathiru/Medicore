import { apiClient } from './client.js'

export const doctorsApi = {
  // Public — no auth required
  listDoctors: () => apiClient.get('/doctors').then((r) => r.data),

  // Doctor-role protected
  getQueue: (date) =>
    apiClient
      .get('/doctors/me/appointments', { params: date ? { date } : {} })
      .then((r) => r.data),

  getPatient: (patientId) =>
    apiClient.get(`/doctors/me/patients/${patientId}`).then((r) => r.data),

  createPrescription: (patientId, body) =>
    apiClient
      .post(`/doctors/me/patients/${patientId}/prescriptions`, body)
      .then((r) => r.data),

  askAI: (patientId, question) =>
    apiClient
      .post(`/doctors/me/patients/${patientId}/ask`, { question })
      .then((r) => r.data),
}
