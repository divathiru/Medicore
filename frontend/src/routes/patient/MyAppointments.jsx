import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { patientsApi } from '../../api/patients.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import ErrorMessage from '../../components/ErrorMessage.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'

// ── helpers ────────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// ── Prescription panel shown when a completed appointment is expanded ──────────
function PrescriptionPanel({ appt }) {
  const hasPrescription = appt.doctor_summary || appt.prescription_text

  if (!hasPrescription) {
    return (
      <div style={{ padding: '1rem 1.25rem', color: 'var(--neutral-400)', fontSize: '0.875rem' }}>
        No prescription record attached to this visit yet.
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '1.25rem 1.5rem',
        background: 'linear-gradient(135deg, rgba(99,102,241,.06), rgba(16,185,129,.06))',
        borderTop: '1px solid rgba(99,102,241,.15)',
      }}
    >
      <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--teal-600)', textTransform: 'uppercase', marginBottom: '1rem' }}>
        📋 Prescription written {formatDate(appt.prescription_created_at)}
      </p>
      {appt.doctor_summary && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--neutral-600)', marginBottom: '0.35rem' }}>
            Doctor's Summary
          </p>
          <p style={{ fontSize: '0.875rem', lineHeight: 1.65, color: 'var(--neutral-800)', whiteSpace: 'pre-wrap' }}>
            {appt.doctor_summary}
          </p>
        </div>
      )}
      {appt.prescription_text && (
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--neutral-600)', marginBottom: '0.35rem' }}>
            Prescription
          </p>
          <pre
            style={{
              fontSize: '0.8125rem',
              lineHeight: 1.65,
              color: 'var(--neutral-800)',
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(99,102,241,.15)',
              borderRadius: '0.5rem',
              padding: '0.75rem 1rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-monospace, monospace',
              margin: 0,
            }}
          >
            {appt.prescription_text}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MyAppointments() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['patient-appointments'],
    queryFn: patientsApi.getAppointments,
  })

  const [expanded, setExpanded] = useState(null)

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error.message} onRetry={refetch} />

  const appointments = data || []
  const completed = appointments.filter((a) => a.status === 'completed')
  const upcoming  = appointments.filter((a) => a.status !== 'completed')

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id))

  const AppointmentCard = ({ appt }) => {
    const isCompleted = appt.status === 'completed'
    const isOpen      = expanded === appt.id

    return (
      <div
        key={appt.id}
        style={{
          borderRadius: '0.875rem',
          border: isCompleted
            ? '1px solid rgba(99,102,241,.25)'
            : '1px solid var(--border)',
          background: isCompleted
            ? 'linear-gradient(135deg, rgba(99,102,241,.04), rgba(16,185,129,.04))'
            : 'var(--surface)',
          overflow: 'hidden',
          transition: 'box-shadow .2s',
          boxShadow: isOpen ? '0 4px 24px rgba(99,102,241,.12)' : 'none',
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem 1.25rem',
            cursor: isCompleted ? 'pointer' : 'default',
            userSelect: 'none',
          }}
          onClick={() => isCompleted && toggle(appt.id)}
          id={`appt-row-${appt.id}`}
        >
          {/* Date block */}
          <div style={{ minWidth: 64, textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1, color: isCompleted ? 'var(--indigo-600, #6366f1)' : 'var(--teal-700)' }}>
              {new Date(appt.scheduled_date).getDate()}
            </div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--neutral-400)' }}>
              {new Date(appt.scheduled_date).toLocaleString('en-GB', { month: 'short' })}
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--neutral-400)' }}>
              {new Date(appt.scheduled_date).getFullYear()}
            </div>
          </div>

          {/* Doctor + dept */}
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>{appt.doctor_name}</p>
            <span className="badge badge-primary" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
              {appt.doctor_department}
            </span>
          </div>

          {/* Status + queue */}
          <div style={{ textAlign: 'right' }}>
            <StatusBadge status={appt.status} />
            {appt.queue_position && (
              <p style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginTop: '0.25rem' }}>
                Queue #{appt.queue_position}
              </p>
            )}
          </div>

          {/* Expand chevron for completed */}
          {isCompleted && (
            <div
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(99,102,241,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#6366f1', fontSize: '0.75rem',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform .25s',
                flexShrink: 0,
              }}
            >
              ▼
            </div>
          )}
        </div>

        {/* Prescription panel — only rendered when expanded */}
        {isCompleted && isOpen && <PrescriptionPanel appt={appt} />}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1>My Appointments</h1>
        <p>Full history of your appointments at MediCore.</p>
      </div>

      {appointments.length === 0 ? (
        <div className="info-box">No appointments on record yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Upcoming / active */}
          {upcoming.length > 0 && (
            <section>
              <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--neutral-400)', marginBottom: '0.75rem' }}>
                Upcoming &amp; Active
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {upcoming.map((a) => <AppointmentCard key={a.id} appt={a} />)}
              </div>
            </section>
          )}

          {/* Completed — expandable */}
          {completed.length > 0 && (
            <section>
              <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--neutral-400)', marginBottom: '0.75rem' }}>
                Completed Visits — click to view prescription
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {completed.map((a) => <AppointmentCard key={a.id} appt={a} />)}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  )
}
