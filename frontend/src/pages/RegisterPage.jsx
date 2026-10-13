import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'

const fieldClass = 'field'

export default function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    if (pending) {
      return
    }
    setError('')
    setPending(true)
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      login(data.access_token)
      navigate('/transactions')
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="page page-narrow">
      <p className="eyebrow">Account</p>
      <h1 className="page-title mt-2">Create an account</h1>
      <p className="lede">
        Your password is stored on this computer as a hash, not as plain text.
      </p>
      <form onSubmit={onSubmit} className="card card-raised mt-6 space-y-4">
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
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? <p className="alert-error">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary w-full"
        >
          {pending ? 'Creating account…' : 'Register'}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Already registered? <Link to="/login" className="link">Log in</Link>
      </p>
    </main>
  )
}
