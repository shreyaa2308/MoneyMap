import { useState } from 'react'
import { clearToken, getToken, saveToken } from './api'
import { AuthContext } from './auth'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getToken())

  function login(nextToken) {
    saveToken(nextToken)
    setToken(nextToken)
  }

  function logout() {
    clearToken()
    setToken(null)
  }

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>
}
