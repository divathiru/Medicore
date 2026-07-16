import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState, useEffect } from 'react'
import { patientsApi } from '../../api/patients.js'
import LoadingSpinner from '../../components/LoadingSpinner.jsx'
import ErrorMessage from '../../components/ErrorMessage.jsx'

const schema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255),
  dob: z.string().optional(),
  phone: z.string().max(30).optional(),
})

export default function Profile() {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  const { data: profile, isLoading, error, refetch } = useQuery({
    queryKey: ['patient-profile'],
    queryFn: patientsApi.getProfile,
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name || '',
        dob: profile.dob ? profile.dob.split('T')[0] : '',
        phone: profile.phone || '',
      })
    }
  }, [profile, reset])

  const mutation = useMutation({
    mutationFn: patientsApi.updateProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error.message} onRetry={refetch} />

  return (
    <div>
      <div className="page-header">
        <h1>My Profile</h1>
        <p>Update your personal information and contact details.</p>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal-600), var(--teal-800))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', color: '#fff' }}>
            👤
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--navy-800)' }}>{profile?.full_name}</div>
            <div style={{ color: 'var(--neutral-500)', fontSize: '0.875rem' }}>{profile?.email}</div>
            <span className="badge badge-primary" style={{ marginTop: '0.35rem' }}>Patient</span>
          </div>
        </div>

        {mutation.isError && <ErrorMessage message={mutation.error.message} />}
        {saved && <div className="info-box" style={{ marginBottom: '1rem' }}>✓ Profile updated successfully!</div>}

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="profile-name">Full name</label>
            <input id="profile-name" className={`form-input${errors.full_name ? ' error' : ''}`} {...register('full_name')} />
            {errors.full_name && <span className="form-error">{errors.full_name.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="profile-email">Email address</label>
            <input id="profile-email" className="form-input" value={profile?.email || ''} disabled style={{ background: 'var(--neutral-100)', cursor: 'not-allowed' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="profile-dob">Date of birth</label>
              <input id="profile-dob" className="form-input" type="date" {...register('dob')} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="profile-phone">Phone</label>
              <input id="profile-phone" className="form-input" type="tel" placeholder="+1 555 0100" {...register('phone')} />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSubmitting || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
