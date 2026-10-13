import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth.js'

export default function HomePage() {
  const { token } = useAuth()
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    let ignore = false

    fetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Health check failed')
        }
        return response.json()
      })
      .then((data) => {
        if (ignore) {
          return
        }
        if (data.status === 'ok' && data.database === 'ok') {
          setBackendStatus('connected, database ok')
        } else {
          setBackendStatus('connected, but the health check was unexpected')
        }
      })
      .catch(() => {
        if (!ignore) {
          setBackendStatus('unreachable. Start the backend, then reload this page.')
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-teal-800">Personal finance</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">MoneyMap</h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
        Track accounts, transactions, budgets, bills, and manual investments on this computer.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {token ? (
          <>
            <Link to="/dashboard" className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white">
              Open dashboard
            </Link>
            <Link to="/transactions" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium">
              View transactions
            </Link>
          </>
        ) : (
          <>
            <Link to="/login" className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white">
              Log in
            </Link>
            <Link to="/register" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium">
              Register
            </Link>
          </>
        )}
      </div>
      <p className="mt-6 text-sm text-slate-500">Backend: {backendStatus}</p>
    </main>
  )
}
