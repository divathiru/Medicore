import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { patientsApi } from '../../api/patients.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'

export default function PatientDashboard() {
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['patient-profile'],
    queryFn: patientsApi.getProfile,
  })

  const { data: appointments, isLoading: apptLoading } = useQuery({
    queryKey: ['patient-appointments'],
    queryFn: patientsApi.getAppointments,
  })

  if (profileLoading) return <LoadingSpinner />

  const upcoming = (appointments || []).filter(
    (a) => a.status !== 'completed' && a.status !== 'cancelled'
  )
  const latest = (appointments || []).slice(0, 3)

  return (
    <div>
      <div className="page-header">
        <h1>Welcome back, {profile?.full_name?.split(' ')[0] || 'Patient'} 👋</h1>
        <p>Here's an overview of your health journey at MediCore.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--teal-50)', color: 'var(--teal-700)' }}>📅</div>
          <div className="stat-label">Upcoming</div>
          <div className="stat-value">{upcoming.length}</div>
          <div className="stat-sub">appointments</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#F0FDF4', color: '#16A34A' }}>✅</div>
          <div className="stat-label">Completed</div>
          <div className="stat-value">{(appointments || []).filter(a => a.status === 'completed').length}</div>
          <div className="stat-sub">visits</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--amber-100)', color: 'var(--amber-600)' }}>🏥</div>
          <div className="stat-label">Total</div>
          <div className="stat-value">{(appointments || []).length}</div>
          <div className="stat-sub">appointments ever</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--navy-800)' }}>Recent Appointments</h2>
          <Link to="/patient/appointments" className="btn btn-ghost btn-sm">View all →</Link>
        </div>

        {apptLoading ? (
          <LoadingSpinner />
        ) : latest.length === 0 ? (
          <div className="info-box">
            No appointments yet.{' '}
            <Link to="/patient/book" style={{ color: 'var(--teal-700)', fontWeight: 600 }}>
              Book your first appointment →
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Department</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Queue</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.doctor_name}</td>
                    <td style={{ color: 'var(--neutral-500)' }}>{a.doctor_department}</td>
                    <td>{new Date(a.scheduled_date).toLocaleDateString()}</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{a.queue_position ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
        <Link to="/patient/book" className="card card-hover" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📅</div>
          <div style={{ fontWeight: 700, color: 'var(--navy-800)', marginBottom: '0.25rem' }}>Book Appointment</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--neutral-500)' }}>Schedule with one of our specialists</div>
        </Link>
        <Link to="/patient/upload" className="card card-hover" style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📁</div>
          <div style={{ fontWeight: 700, color: 'var(--navy-800)', marginBottom: '0.25rem' }}>Upload Medical Records</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--neutral-500)' }}>Share past reports with your doctor's AI</div>
        </Link>
      </div>
    </div>
  )
}
