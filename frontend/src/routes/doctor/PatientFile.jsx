import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import { doctorsApi } from '../../api/doctors.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import ErrorMessage from '../../components/ErrorMessage.jsx'
import PrescriptionForm from './PrescriptionForm.jsx'

// Shared bullet formatter — identical to ChatWidget so both panels always match.
// Lines starting with "- ", "* ", or "•" render as teal dot bullets.
function formatBotMessage(text) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const bulletMatch = line.match(/^(\s*)([-*•])\s+(.+)/)
    if (bulletMatch) {
      const content = renderInline(bulletMatch[3])
      return (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: i === 0 ? 0 : '0.25rem' }}>
          <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: 'var(--teal-600)', flexShrink: 0, marginTop: '0.45em',
          }} />
          <span>{content}</span>
        </div>
      )
    }
    if (!line.trim()) return <div key={i} style={{ height: '0.4rem' }} />
    return <div key={i}>{renderInline(line)}</div>
  })
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export default function PatientFile() {
  const { appointmentId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // patient_id is passed via React Router location.state from Queue.jsx
  // The queue API now returns patient_id (p.id AS patient_id) in each row.
  const patientId = location.state?.patient_id

  const [aiMessages, setAiMessages] = useState([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const aiBottomRef = useRef(null)

  useEffect(() => {
    aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  const { data: patientRecord, isLoading, error } = useQuery({
    queryKey: ['doctor-patient', patientId],
    queryFn: () => doctorsApi.getPatient(patientId),
    enabled: !!patientId,
  })

  const askAI = async () => {
    const q = aiInput.trim()
    if (!q || aiLoading || !patientId) return
    setAiInput('')
    setAiMessages((m) => [...m, { role: 'user', text: q }])
    setAiLoading(true)
    try {
      const data = await doctorsApi.askAI(patientId, q)
      setAiMessages((m) => [...m, { role: 'assistant', text: data.answer || data.response || JSON.stringify(data) }])
    } catch (err) {
      setAiMessages((m) => [...m, { role: 'assistant', text: `Error: ${err.message}` }])
    } finally {
      setAiLoading(false)
    }
  }

  if (!patientId) {
    return (
      <div>
        <div className="page-header">
          <h1>Patient File</h1>
        </div>
        <div className="error-box">
          Patient ID not found. Please open this file from the{' '}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/doctor/queue')}>queue →</button>
        </div>
      </div>
    )
  }

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error.message} />

  const { patient, old_summaries, prescriptions } = patientRecord || {}

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/doctor/queue')}>
          ← Back to Queue
        </button>
        <div className="page-header" style={{ margin: 0, flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem' }}>Patient File</h1>
        </div>
      </div>

      {/* Patient Profile */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal-600), var(--navy-700))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.5rem' }}>
            👤
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{patient?.full_name}</div>
            <div style={{ color: 'var(--neutral-500)', fontSize: '0.875rem' }}>{patient?.email}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div><span style={{ fontSize: '0.8125rem', color: 'var(--neutral-500)', display: 'block' }}>Date of Birth</span><strong>{patient?.dob ? new Date(patient.dob).toLocaleDateString() : '—'}</strong></div>
          <div><span style={{ fontSize: '0.8125rem', color: 'var(--neutral-500)', display: 'block' }}>Phone</span><strong>{patient?.phone || '—'}</strong></div>
          <div><span style={{ fontSize: '0.8125rem', color: 'var(--neutral-500)', display: 'block' }}>Records</span><strong>{(old_summaries || []).length} uploaded</strong></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Old Summaries */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Medical History ({(old_summaries || []).length})</h2>
            {old_summaries?.length === 0 ? (
              <div style={{ color: 'var(--neutral-400)', fontSize: '0.9rem' }}>No uploaded records.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {old_summaries.map((s) => (
                  <div key={s.id} style={{ padding: '1rem', background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{s.source_hospital || 'Unknown hospital'}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--neutral-400)', marginBottom: '0.5rem' }}>
                      Uploaded {new Date(s.uploaded_at).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--neutral-600)', whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'hidden' }}>
                      {s.extracted_text?.slice(0, 300)}{s.extracted_text?.length > 300 ? '…' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past Prescriptions */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Past Prescriptions ({(prescriptions || []).length})</h2>
            {prescriptions?.length === 0 ? (
              <div style={{ color: 'var(--neutral-400)', fontSize: '0.9rem' }}>No prescriptions yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {prescriptions.map((p) => (
                  <div key={p.id} style={{ padding: '1rem', background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                      {new Date(p.scheduled_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--neutral-700)', marginBottom: '0.5rem', fontStyle: 'italic' }}>{p.doctor_summary}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--neutral-600)', whiteSpace: 'pre-wrap' }}>{p.prescription_text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prescription Form */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Write Prescription</h2>
            <PrescriptionForm
              patientId={patientId}
              appointmentId={appointmentId}
            />
          </div>
        </div>

        {/* AI Panel */}
        <div style={{ position: 'sticky', top: '1.5rem' }}>
          <div className="ai-panel">
            <h3>🤖 AI Assistant — {patient?.full_name?.split(' ')[0]}'s Records</h3>
            <div className="ai-messages">
              {aiMessages.length === 0 && (
                <div className="ai-message assistant" style={{ opacity: 0.65 }}>
                  Ask me anything about this patient's uploaded medical history and past prescriptions.
                </div>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} className={`ai-message ${m.role}`}>
                  {m.role === 'assistant' ? formatBotMessage(m.text) : m.text}
                </div>
              ))}
              {aiLoading && <div className="ai-message assistant" style={{ opacity: 0.6 }}>Thinking…</div>}
              <div ref={aiBottomRef} />
            </div>
            <div className="ai-input-row">
              <input
                className="ai-input"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askAI() } }}
                placeholder="Ask about this patient…"
                disabled={aiLoading}
              />
              <button className="btn btn-primary btn-sm" onClick={askAI} disabled={aiLoading}>
                Ask
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
