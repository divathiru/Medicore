import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { cashierApi } from '../../api/cashier.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import ErrorMessage from '../../components/ErrorMessage.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'

function PaymentModal({ appointment, onClose, onPaid }) {
  const [amount, setAmount] = useState('500')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      cashierApi.processPayment({
        appointment_id: appointment.id,
        amount: parseFloat(amount),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cashier-booked'] })
      onPaid(data)
    },
    onError: (err) => setError(err.message),
  })

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">💳 Process Payment</div>
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div><strong>Patient:</strong> {appointment.patient_name}</div>
          <div><strong>Doctor:</strong> {appointment.doctor_name}</div>
          <div><strong>Department:</strong> {appointment.doctor_department}</div>
          <div><strong>Date:</strong> {new Date(appointment.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        </div>

        {error && <div className="error-box" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div className="form-group">
          <label className="form-label" htmlFor="payment-amount">Consultation fee (₹)</label>
          <input
            id="payment-amount"
            className="form-input"
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            id="payment-confirm"
            className="btn btn-primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !amount || parseFloat(amount) <= 0}
          >
            {mutation.isPending ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PaymentQueue() {
  const qc = useQueryClient()
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [lastPaid, setLastPaid] = useState(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['cashier-booked'],
    queryFn: () => cashierApi.getBookedAppointments(),
    refetchInterval: 30_000,
  })

  const appointments = data || []

  const handlePaid = (result) => {
    setLastPaid(result)
    setSelectedAppt(null)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Payment Queue</h1>
        <p>Process payments for booked appointments and assign queue positions.</p>
      </div>

      {lastPaid && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-lg)', color: '#065F46' }}>
          ✓ Payment processed! Queue position assigned: <strong>#{lastPaid.queue_position}</strong>.
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: '1rem' }} onClick={() => setLastPaid(null)}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <div className="badge badge-primary">
          {appointments.length} pending payment{appointments.length !== 1 ? 's' : ''}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>↻ Refresh</button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error.message} onRetry={refetch} />
      ) : appointments.length === 0 ? (
        <div className="info-box">No appointments pending payment. 🎉</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Booked at</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.patient_name}</td>
                    <td>{a.doctor_name}</td>
                    <td><span className="badge badge-primary">{a.doctor_department}</span></td>
                    <td>{new Date(a.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td style={{ fontSize: '0.875rem', color: 'var(--neutral-400)' }}>
                      {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <button
                        id={`pay-btn-${a.id}`}
                        className="btn btn-primary btn-sm"
                        onClick={() => setSelectedAppt(a)}
                      >
                        Process Payment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedAppt && (
        <PaymentModal
          appointment={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onPaid={handlePaid}
        />
      )}
    </div>
  )
}
