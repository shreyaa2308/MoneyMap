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
    <main className="page flex min-h-[70vh] items-center">
      <section className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="eyebrow">Personal finance</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">MoneyMap</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            Track accounts, transactions, budgets, bills, and manual investments on this computer.
            The assistant explains those saved records. It does not connect to a bank.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {token ? (
              <>
                <Link to="/dashboard" className="btn btn-primary">
                  Open dashboard
                </Link>
                <Link to="/transactions" className="btn btn-secondary">
                  View transactions
                </Link>
                <Link to="/assistant" className="btn btn-secondary">
                  Ask the assistant
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-primary">
                  Log in
                </Link>
                <Link to="/register" className="btn btn-secondary">
                  Register
                </Link>
              </>
            )}
          </div>
          <p className="mt-6 text-sm text-faint">Backend: {backendStatus}</p>
        </div>
        <aside className="card bg-navy text-white">
          <p className="text-sm text-white/70">On this computer</p>
          <p className="money mt-3 text-3xl font-semibold">Accounts, cash flow, and bills in one place.</p>
          <ul className="mt-6 space-y-3 text-sm text-white/80">
            <li>Income in green, spending kept separate from budget limits.</li>
            <li>Manual transactions and a bank-statement CSV preview.</li>
            <li>A read-only assistant that explains saved totals.</li>
          </ul>
        </aside>
      </section>
    </main>
  )
}
