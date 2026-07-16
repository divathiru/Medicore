import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { authApi } from '../../api/auth.js'
import { useAuth } from '../../auth/useAuth.jsx'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password too long'),
  full_name: z.string().min(1, 'Full name is required').max(255),
  dob: z.string().optional(),
  phone: z.string().max(30).optional(),
})

export default function SignupPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async (data) => {
    setServerError('')
    try {
      const res = await authApi.signup(data)
      login(res.token)
      navigate('/patient/dashboard')
    } catch (err) {
      setServerError(err.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--navy-800), var(--teal-800))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--teal-700)' }}>
            MediCore
          </Link>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--navy-800)', marginTop: '1rem' }}>
            Create your account
          </h1>
          <p style={{ color: 'var(--neutral-500)', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
            Patient registration — free and instant
          </p>
        </div>

        {serverError && <div className="error-box" style={{ marginBottom: '1.5rem' }}>{serverError}</div>}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="signup-name">Full name</label>
            <input
              id="signup-name"
              className={`form-input${errors.full_name ? ' error' : ''}`}
              placeholder="Jane Smith"
              {...register('full_name')}
            />
            {errors.full_name && <span className="form-error">{errors.full_name.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
              className={`form-input${errors.email ? ' error' : ''}`}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
            />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className={`form-input${errors.password ? ' error' : ''}`}
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              {...register('password')}
            />
            {errors.password && <span className="form-error">{errors.password.message}</span>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-dob">Date of birth</label>
              <input
                id="signup-dob"
                className="form-input"
                type="date"
                {...register('dob')}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="signup-phone">Phone (optional)</label>
              <input
                id="signup-phone"
                className="form-input"
                type="tel"
                placeholder="+1 555 0100"
                {...register('phone')}
              />
            </div>
          </div>

          <button
            id="signup-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--neutral-500)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--teal-700)', fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
