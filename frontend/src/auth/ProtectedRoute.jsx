import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth.jsx'

const ROLE_HOME = {
  patient: '/patient/dashboard',
  doctor: '/doctor/queue',
  cashier: '/cashier/queue',
}

/**
 * Wraps a route that requires authentication + optionally a specific role.
 * - Unauthenticated → /login
 * - Wrong role → redirect to their own dashboard
 */
export function ProtectedRoute({ children, role }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (role && user.role !== role) {
    const home = ROLE_HOME[user.role] || '/login'
    return <Navigate to={home} replace />
  }

  return children
}
