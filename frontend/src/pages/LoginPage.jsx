import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'

const fieldClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function onSubmit(event) {
    event.preventDefault()
    setError('')
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      login(data.access_token)
      navigate('/transactions')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Log in</h1>
      <p className="mt-2 text-slate-600">Use your MoneyMap email and password.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Email
          <input
            className={fieldClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            className={fieldClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        <button
          type="submit"
          className="w-full rounded-md bg-teal-800 px-4 py-2 font-medium text-white"
        >
          Log in
        </button>
      </form>
      <p className="mt-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Fictional sample login: demo@moneymap.example / demopassword
      </p>
      <p className="mt-4 text-sm text-slate-600">
        New here? <Link to="/register" className="text-teal-800">Create an account</Link>
      </p>
    </main>
  )
}
