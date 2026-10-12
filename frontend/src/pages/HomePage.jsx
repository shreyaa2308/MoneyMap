import { useEffect, useState } from 'react'

export default function HomePage() {
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
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-sm font-medium tracking-wide text-teal-800">
          Personal finance
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          MoneyMap
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
          A local place to see your money. This page is only the shell.
          Summaries, transactions, and charts come in later blocks.
        </p>
        <p className="mt-6 text-sm text-slate-500">Backend: {backendStatus}</p>
      </div>
    </main>
  )
}
