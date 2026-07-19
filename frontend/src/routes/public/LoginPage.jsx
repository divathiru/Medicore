import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { authApi } from '../../api/auth.js'
import { useAuth } from '../../auth/useAuth.jsx'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

const ROLE_HOME = {
  patient: '/patient/dashboard',
  doctor: '/doctor/queue',
  cashier: '/cashier/queue',
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async (data) => {
    setServerError('')
    try {
      const res = await authApi.login(data)
      const decoded = login(res.token)
      const from = location.state?.from?.pathname
      navigate(from && from !== '/login' ? from : (ROLE_HOME[decoded.role] || '/'))
    } catch (err) {
      setServerError(err.message)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, var(--navy-800), var(--teal-800))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--teal-700)' }}>
            MediCore
          </Link>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--navy-800)', marginTop: '1rem' }}>
            Welcome back
          </h1>
          <p style={{ color: 'var(--neutral-500)', fontSize: '0.9375rem', marginTop: '0.25rem' }}>
            Sign in to your account
          </p>
        </div>

        {serverError && <div className="error-box" style={{ marginBottom: '1.5rem' }}>{serverError}</div>}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              className={`form-input${errors.email ? ' error' : ''}`}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
            />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className={`form-input${errors.password ? ' error' : ''}`}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && <span className="form-error">{errors.password.message}</span>}
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--neutral-500)' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--teal-700)', fontWeight: 600 }}>Create account</Link>
        </div>

        
      </div>
    </div>
  )
}
