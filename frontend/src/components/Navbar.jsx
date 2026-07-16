import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.jsx'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">MediCore</Link>

      <div className="navbar-nav">
        <a href="#departments" className="navbar-link">Departments</a>
        <a href="#doctors" className="navbar-link">Our Doctors</a>
        <a href="#about" className="navbar-link">About</a>
      </div>

      <div className="navbar-actions">
        {user ? (
          <>
            <span style={{ fontSize: '0.875rem', color: 'var(--neutral-500)' }}>
              {user.role}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost btn-sm">Sign in</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">Get Started</Link>
          </>
        )}
      </div>
    </nav>
  )
}
