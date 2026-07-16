import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.jsx'

const NAV = [
  { to: '/patient/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/patient/profile', label: 'My Profile', icon: '👤' },
  { to: '/patient/book', label: 'Book Appointment', icon: '📅' },
  { to: '/patient/appointments', label: 'My Appointments', icon: '🗓' },
  { to: '/patient/upload', label: 'Upload Records', icon: '📁' },
]

export default function PatientLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>MediCore</h1>
          <span>Patient Portal</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.5rem' }}>
            Signed in as patient
          </div>
          <button className="btn btn-ghost btn-sm btn-full" onClick={handleLogout}
            style={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.15)' }}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="dashboard-main">
        <Outlet />
      </main>
    </div>
  )
}
