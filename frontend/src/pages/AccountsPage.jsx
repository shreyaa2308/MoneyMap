import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import { formatCents } from '../money'

const fieldClass = 'field'

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
  const [saving, setSaving] = useState(false)
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
    if (saving) {
      return
    }
    const body = JSON.stringify({ name, account_type: accountType })
    setSaving(true)
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
    } finally {
      setSaving(false)
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
    <main className="page">
      <h1 className="page-title">Accounts</h1>
      <p className="lede">
        Balances come from transactions. Net worth adds those balances to manual investment values once.
        Checking, savings, and cash are the only account types. There are no loan or credit-card accounts, so a
        negative balance lowers net worth instead of being tracked as a separate liability.
      </p>
      {error ? <p className="alert-error mt-4">{error}</p> : null}
      {loading ? <p className="mt-6 text-faint">Loading accounts…</p> : null}
      {!loading && worth ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <section className="card">
              <p className="text-sm text-faint">Cash</p>
              <p className={worth.cash_cents < 0 ? 'money mt-3 text-3xl font-semibold text-negative' : 'money mt-3 text-3xl font-semibold text-pine'}>
                {formatCents(worth.cash_cents)}
              </p>
            </section>
            <section className="card">
              <p className="text-sm text-faint">Investments</p>
              <p className="money mt-3 text-3xl font-semibold">{formatCents(worth.investments_cents)}</p>
            </section>
            <section className="card bg-navy text-white">
              <p className="text-sm text-white/70">Net worth</p>
              <p className="money mt-3 text-3xl font-semibold">{formatCents(worth.net_worth_cents)}</p>
            </section>
          </div>

          {accounts.length === 0 ? (
            <p className="mt-6 text-sm text-faint">No accounts yet.</p>
          ) : (
            <ul className="mt-6 list">
              {accounts.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-sm capitalize text-faint">{account.account_type}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className={account.balance_cents < 0 ? 'money font-semibold text-negative' : account.balance_cents > 0 ? 'money font-semibold text-pine' : 'money font-semibold'}>
                      {formatCents(account.balance_cents)}
                    </p>
                    <button
                      type="button"
                      className="text-sm text-pine"
                      onClick={() => {
                        setEditingId(account.id)
                        setName(account.name)
                        setAccountType(account.account_type)
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="alert-error" onClick={() => onDelete(account)}>
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
                  className="btn btn-primary disabled:opacity-50"
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

          <form onSubmit={onSave} className="mt-6 grid gap-3 card sm:grid-cols-[1fr_10rem_auto]">
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
            <button type="submit" disabled={saving} className="self-end btn btn-primary">
              {saving ? 'Saving…' : editingId ? 'Save account' : 'Add account'}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="self-end btn btn-secondary text-sm">
                Cancel
              </button>
            ) : null}
          </form>
          <p className="mt-4 text-sm text-muted">
            Investment values are entered on the <Link to="/investments" className="text-pine">Investments</Link> page.
          </p>
        </>
      ) : null}
    </main>
  )
}
