import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { doctorsApi } from '../../api/doctors.js'
import ErrorMessage from '../../components/ErrorMessage.jsx'

const schema = z.object({
  doctor_summary: z.string().min(1, 'Clinical summary is required').max(4000),
  prescription_text: z.string().min(1, 'Prescription text is required').max(8000),
})

export default function PrescriptionForm({ patientId, appointmentId }) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })

  const mutation = useMutation({
    mutationFn: (data) =>
      doctorsApi.createPrescription(patientId, {
        appointment_id: appointmentId,
        ...data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor-patient', patientId] })
      qc.invalidateQueries({ queryKey: ['doctor-queue'] })
      setSaved(true)
      reset()
      setTimeout(() => setSaved(false), 5000)
    },
  })

  return (
    <div>
      {mutation.isError && <ErrorMessage message={mutation.error.message} />}
      {saved && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-md)', color: '#065F46', fontSize: '0.9rem' }}>
          ✓ Prescription saved! Appointment marked as completed.
        </div>
      )}

      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="rx-summary">Clinical summary</label>
          <textarea
            id="rx-summary"
            className={`form-input form-textarea${errors.doctor_summary ? ' error' : ''}`}
            rows={3}
            placeholder="Brief clinical findings and diagnosis…"
            {...register('doctor_summary')}
          />
          {errors.doctor_summary && <span className="form-error">{errors.doctor_summary.message}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="rx-text">Prescription</label>
          <textarea
            id="rx-text"
            className={`form-input form-textarea${errors.prescription_text ? ' error' : ''}`}
            rows={4}
            placeholder="Medications, dosage, instructions…"
            {...register('prescription_text')}
          />
          {errors.prescription_text && <span className="form-error">{errors.prescription_text.message}</span>}
        </div>

        <button
          id="rx-submit"
          type="submit"
          className="btn btn-primary"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Save Prescription & Complete'}
        </button>
      </form>
    </div>
  )
}
