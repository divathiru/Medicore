import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doctorsApi } from '../../api/doctors.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import ErrorMessage from '../../components/ErrorMessage.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'

export default function Queue() {
  const [date, setDate] = useState('')
  const navigate = useNavigate()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['doctor-queue', date],
    queryFn: () => doctorsApi.getQueue(date || undefined),
  })

  const queue = data || []

  return (
    <div>
      <div className="page-header">
        <h1>Appointment Queue</h1>
        <p>View and manage your patient queue.</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="form-group" style={{ margin: 0, flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
          <label className="form-label" htmlFor="queue-date" style={{ whiteSpace: 'nowrap' }}>Queue date:</label>
          <input
            id="queue-date"
            className="form-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: 180 }}
          />
        </div>
        {date && (
          <button className="btn btn-ghost btn-sm" onClick={() => setDate('')}>
            Reset to today
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => refetch()}>
          ↻ Refresh
        </button>
        <div className="badge badge-primary" style={{ marginLeft: 'auto' }}>
          {queue.length} patient{queue.length !== 1 ? 's' : ''}
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error.message} onRetry={refetch} />
      ) : queue.length === 0 ? (
        <div className="info-box">
          No appointments {date ? `on ${date}` : 'today'}. Enjoy the quiet! ☕
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Booked at</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--teal-700)' }}>
                        {row.queue_position ?? '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{row.patient_name}</td>
                    <td>{new Date(row.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                    <td><StatusBadge status={row.status} /></td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '0.875rem' }}>
                      {new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/doctor/patient/${row.id}`, { state: { patient_id: row.patient_id, queue_patient_name: row.patient_name } })}
                      >
                        Open File →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
