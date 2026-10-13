import { useEffect, useState } from 'react'
import { api, clearToken, getToken, saveToken } from './api'
import { AuthContext } from './auth'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken())
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!token) {
      return undefined
    }
    let ignore = false
    api('/api/auth/me')
      .then((data) => {
        if (!ignore) {
          setEmail(data.email || '')
        }
      })
      .catch(() => {
        if (!ignore) {
          setEmail('')
        }
      })
    return () => {
      ignore = true
    }
  }, [token])

  function login(nextToken) {
    saveToken(nextToken)
    setToken(nextToken)
  }

  function logout() {
    clearToken()
    setToken(null)
    setEmail('')
  }

  return <AuthContext.Provider value={{ token, email, login, logout }}>{children}</AuthContext.Provider>
}
