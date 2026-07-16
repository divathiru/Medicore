import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth/useAuth.jsx'
import { ProtectedRoute } from './auth/ProtectedRoute.jsx'

// Public
import LandingPage from './routes/public/LandingPage.jsx'
import LoginPage from './routes/public/LoginPage.jsx'
import SignupPage from './routes/public/SignupPage.jsx'

// Patient
import PatientLayout from './routes/patient/PatientLayout.jsx'
import PatientDashboard from './routes/patient/Dashboard.jsx'
import Profile from './routes/patient/Profile.jsx'
import UploadSummary from './routes/patient/UploadSummary.jsx'
import BookAppointment from './routes/patient/BookAppointment.jsx'
import MyAppointments from './routes/patient/MyAppointments.jsx'

// Doctor
import DoctorLayout from './routes/doctor/DoctorLayout.jsx'
import Queue from './routes/doctor/Queue.jsx'
import PatientFile from './routes/doctor/PatientFile.jsx'

// Cashier
import CashierLayout from './routes/cashier/CashierLayout.jsx'
import PaymentQueue from './routes/cashier/PaymentQueue.jsx'

function RoleRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'patient') return <Navigate to="/patient/dashboard" replace />
  if (user.role === 'doctor') return <Navigate to="/doctor/queue" replace />
  if (user.role === 'cashier') return <Navigate to="/cashier/queue" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Role redirect after login */}
      <Route path="/dashboard" element={<RoleRedirect />} />

      {/* Patient routes */}
      <Route
        path="/patient"
        element={
          <ProtectedRoute role="patient">
            <PatientLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/patient/dashboard" replace />} />
        <Route path="dashboard" element={<PatientDashboard />} />
        <Route path="profile" element={<Profile />} />
        <Route path="upload" element={<UploadSummary />} />
        <Route path="book" element={<BookAppointment />} />
        <Route path="appointments" element={<MyAppointments />} />
      </Route>

      {/* Doctor routes */}
      <Route
        path="/doctor"
        element={
          <ProtectedRoute role="doctor">
            <DoctorLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/doctor/queue" replace />} />
        <Route path="queue" element={<Queue />} />
        <Route path="patient/:appointmentId" element={<PatientFile />} />
      </Route>

      {/* Cashier routes */}
      <Route
        path="/cashier"
        element={
          <ProtectedRoute role="cashier">
            <CashierLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/cashier/queue" replace />} />
        <Route path="queue" element={<PaymentQueue />} />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
