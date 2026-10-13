import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import { formatCents } from '../money'

const fieldClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2'

export default function AccountsPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [worth, setWorth] = useState(null)
  const [name, setName] = useState('')
  const [accountType, setAccountType] = useState('checking')
  const [editingId, setEditingId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [reassignTo, setReassignTo] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!token) {
      navigate('/login')
    }
  }, [token, navigate])

  useEffect(() => {
    if (!token) {
      return undefined
    }
    let ignore = false
    async function load() {
      setLoading(true)
      try {
        const summary = await api('/api/net-worth')
        if (ignore) {
          return
        }
        setWorth(summary)
        setError('')
      } catch (err) {
        if (ignore) {
          return
        }
        if (err.status === 401) {
          logout()
          navigate('/login')
          return
        }
        setError(err.message)
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [token, reloadKey, logout, navigate])

  function resetForm() {
    setName('')
    setAccountType('checking')
    setEditingId(null)
  }

  async function onSave(event) {
    event.preventDefault()
    const body = JSON.stringify({ name, account_type: accountType })
    try {
      if (editingId) {
        await api(`/api/accounts/${editingId}`, { method: 'PUT', body })
      } else {
        await api('/api/accounts', { method: 'POST', body })
      }
      resetForm()
      setError('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function onDelete(account) {
    try {
      await api(`/api/accounts/${account.id}`, { method: 'DELETE' })
      setPendingDelete(null)
      setError('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      if (err.status === 409) {
        setPendingDelete(account)
        setError(err.message)
        return
      }
      setError(err.message)
    }
  }

  async function confirmDelete(mode) {
    const params = new URLSearchParams()
    if (mode === 'move') {
      params.set('reassign_to', reassignTo)
    } else {
      params.set('confirm', 'delete-transactions')
    }
    try {
      await api(`/api/accounts/${pendingDelete.id}?${params.toString()}`, { method: 'DELETE' })
      setPendingDelete(null)
      setReassignTo('')
      setError('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  const accounts = worth?.accounts || []

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold">Accounts</h1>
      <p className="mt-2 text-slate-600">
        Balances come from transactions. Net worth adds those balances to manual investment values once.
      </p>
      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      {loading || !worth ? (
        <p className="mt-6 text-slate-500">Loading accounts…</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Cash</p>
              <p className="mt-2 text-2xl font-semibold">{formatCents(worth.cash_cents)}</p>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Investments</p>
              <p className="mt-2 text-2xl font-semibold">{formatCents(worth.investments_cents)}</p>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Net worth</p>
              <p className="mt-2 text-2xl font-semibold">{formatCents(worth.net_worth_cents)}</p>
            </section>
          </div>

          {accounts.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No accounts yet.</p>
          ) : (
            <ul className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {accounts.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-sm capitalize text-slate-500">{account.account_type}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-medium">{formatCents(account.balance_cents)}</p>
                    <button
                      type="button"
                      className="text-sm text-teal-800"
                      onClick={() => {
                        setEditingId(account.id)
                        setName(account.name)
                        setAccountType(account.account_type)
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="text-sm text-rose-700" onClick={() => onDelete(account)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pendingDelete ? (
            <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              <p>
                {pendingDelete.name} still has transactions. Moving them keeps the history. Deleting them removes
                those transactions permanently.
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="text-sm font-medium">
                  Move to
                  <select
                    className={fieldClass}
                    value={reassignTo}
                    onChange={(event) => setReassignTo(event.target.value)}
                  >
                    <option value="">Choose an account</option>
                    {accounts
                      .filter((account) => account.id !== pendingDelete.id)
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!reassignTo}
                  onClick={() => confirmDelete('move')}
                  className="rounded-md bg-teal-800 px-3 py-2 text-white disabled:opacity-50"
                >
                  Move transactions
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete('delete')}
                  className="rounded-md border border-rose-300 px-3 py-2 text-rose-700"
                >
                  Delete transactions too
                </button>
              </div>
            </section>
          ) : null}

          <form onSubmit={onSave} className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_10rem_auto]">
            <label className="text-sm font-medium">
              Name
              <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="text-sm font-medium">
              Type
              <select className={fieldClass} value={accountType} onChange={(event) => setAccountType(event.target.value)}>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="cash">Cash</option>
              </select>
            </label>
            <button type="submit" className="self-end rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white">
              {editingId ? 'Save account' : 'Add account'}
            </button>
          </form>
          <p className="mt-4 text-sm text-slate-600">
            Investment values are entered on the <Link to="/investments" className="text-teal-800">Investments</Link> page.
          </p>
        </>
      )}
    </main>
  )
}
