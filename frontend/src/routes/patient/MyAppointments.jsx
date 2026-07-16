import { useQuery } from '@tanstack/react-query'
import { patientsApi } from '../../api/patients.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import ErrorMessage from '../../components/ErrorMessage.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'

export default function MyAppointments() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['patient-appointments'],
    queryFn: patientsApi.getAppointments,
  })

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error.message} onRetry={refetch} />

  const appointments = data || []

  return (
    <div>
      <div className="page-header">
        <h1>My Appointments</h1>
        <p>Full history of your appointments at MediCore.</p>
      </div>

      {appointments.length === 0 ? (
        <div className="info-box">No appointments on record yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Queue #</th>
                  <th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.doctor_name}</td>
                    <td>
                      <span className="badge badge-primary">{a.doctor_department}</span>
                    </td>
                    <td>{new Date(a.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td style={{ fontWeight: 600 }}>{a.queue_position ?? '—'}</td>
                    <td style={{ color: 'var(--neutral-400)', fontSize: '0.875rem' }}>
                      {new Date(a.created_at).toLocaleDateString()}
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
