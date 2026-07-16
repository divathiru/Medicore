import { apiClient } from './client.js'

export const cashierApi = {
  processPayment: (body) =>
    apiClient.post('/cashier/payments', body).then((r) => r.data),

  getQueue: (doctorId, date) =>
    apiClient
      .get(`/cashier/queue/${doctorId}`, { params: date ? { date } : {} })
      .then((r) => r.data),

  // New endpoint — returns booked appointments with real IDs
  getBookedAppointments: (date) =>
    apiClient
      .get('/cashier/appointments', {
        params: { status: 'booked', ...(date ? { date } : {}) },
      })
      .then((r) => r.data),
}
