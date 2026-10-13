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

  const healthy = backendStatus.startsWith('connected, database')
  const failed = backendStatus.startsWith('unreachable') || backendStatus.includes('unexpected')
  const statusDot = healthy ? 'bg-pine' : failed ? 'bg-negative' : 'bg-amber-500'

  return (
    <main className="page">
      <section className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
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
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted">
            <span className={`h-2 w-2 rounded-full ${statusDot}`} aria-hidden="true" />
            Backend: {backendStatus}
          </p>
        </div>
        <aside className="card card-accent p-6 sm:p-8">
          <p className="eyebrow">On this computer</p>
          <p className="mt-4 text-3xl font-semibold tracking-tight">Accounts, cash flow, and bills in one place.</p>
          <ul className="mt-6 space-y-3 text-sm leading-6 text-muted">
            <li>Income in green, spending kept separate from budget limits.</li>
            <li>Manual transactions and a bank-statement CSV preview.</li>
            <li>A read-only assistant that explains saved totals.</li>
          </ul>
        </aside>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="card card-hover">
          <p className="eyebrow">Accounts</p>
          <h2 className="mt-2 text-lg font-semibold">Balances from your transactions</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Checking, savings, and cash, plus a net worth that includes manual holdings once.</p>
        </article>
        <article className="card card-hover">
          <p className="eyebrow">Cash flow</p>
          <h2 className="mt-2 text-lg font-semibold">Budgets, bills, and spending</h2>
          <p className="mt-2 text-sm leading-6 text-muted">A budget is a spending limit. Marking a bill paid records one expense.</p>
        </article>
        <article className="card card-hover">
          <p className="eyebrow">Assistant</p>
          <h2 className="mt-2 text-lg font-semibold">Explanations of saved totals</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Ask about the records in this account. The assistant cannot change them.</p>
        </article>
      </section>
    </main>
  )
}
