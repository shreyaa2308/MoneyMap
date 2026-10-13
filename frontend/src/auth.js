import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (value == null) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return value
}

export function friendlyName(email) {
  const local = String(email || '').split('@')[0]
  const word = local.split(/[._+-]/)[0]
  if (!word) {
    return ''
  }
  return word.charAt(0).toUpperCase() + word.slice(1)
}
