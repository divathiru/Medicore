import { createContext, useContext, useState, useCallback } from 'react'
import { jwtDecode } from 'jwt-decode'

const AuthContext = createContext(null)

function decodeUser(token) {
  try {
    const payload = jwtDecode(token)
    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return { sub: payload.sub, role: payload.role, exp: payload.exp }
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('mc_token') || null)
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem('mc_token')
    return t ? decodeUser(t) : null
  })

  const login = useCallback((newToken) => {
    const decoded = decodeUser(newToken)
    if (!decoded) throw new Error('Invalid token received')
    localStorage.setItem('mc_token', newToken)
    setToken(newToken)
    setUser(decoded)
    return decoded
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('mc_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
