import { useQuery, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { patientsApi } from '../../api/patients.js'
import { doctorsApi } from '../../api/doctors.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import ErrorMessage from '../../components/ErrorMessage.jsx'

const schema = z.object({
  doctor_id: z.string().uuid('Please select a doctor'),
  scheduled_date: z.string().min(1, 'Please select a date'),
})

export default function BookAppointment() {
  const [booked, setBooked] = useState(null)

  const { data: doctors, isLoading: loadingDoctors } = useQuery({
    queryKey: ['public-doctors'],
    queryFn: doctorsApi.listDoctors,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) })

  const mutation = useMutation({
    mutationFn: patientsApi.bookAppointment,
    onSuccess: (data) => {
      setBooked(data)
      reset()
    },
  })

  // Min date = tomorrow
  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)
  const minDateStr = minDate.toISOString().split('T')[0]

  if (loadingDoctors) return <LoadingSpinner />

  return (
    <div>
      <div className="page-header">
        <h1>Book an Appointment</h1>
        <p>Select a specialist and your preferred date.</p>
      </div>

      {booked && (
        <div style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-lg)', color: '#065F46' }}>
          ✓ <strong>Appointment booked!</strong> Your appointment ID is{' '}
          <code style={{ fontSize: '0.875rem', background: 'rgba(0,0,0,0.08)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>{booked.id?.slice(0, 8)}…</code>.
          {' '}Visit the cashier desk to complete payment and join the queue.
          <br />
          <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem', color: '#065F46' }} onClick={() => setBooked(null)}>
            Book another →
          </button>
        </div>
      )}

      {mutation.isError && <ErrorMessage message={mutation.error.message} />}

      <div className="card" style={{ maxWidth: 520 }}>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="book-doctor">Choose a doctor</label>
            <select id="book-doctor" className={`form-input${errors.doctor_id ? ' error' : ''}`} {...register('doctor_id')} defaultValue="">
              <option value="" disabled>Select a specialist…</option>
              {(doctors || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name} — {d.department} ({d.experience_years} yrs exp)
                </option>
              ))}
            </select>
            {errors.doctor_id && <span className="form-error">{errors.doctor_id.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="book-date">Preferred date</label>
            <input
              id="book-date"
              className={`form-input${errors.scheduled_date ? ' error' : ''}`}
              type="date"
              min={minDateStr}
              {...register('scheduled_date')}
            />
            {errors.scheduled_date && <span className="form-error">{errors.scheduled_date.message}</span>}
          </div>

          <div className="info-box" style={{ fontSize: '0.875rem' }}>
            📌 After booking, visit the cashier desk to process payment and receive your queue number.
          </div>

          <button
            id="book-submit"
            type="submit"
            className="btn btn-primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Booking…' : 'Confirm Appointment'}
          </button>
        </form>
      </div>
    </div>
  )
}
