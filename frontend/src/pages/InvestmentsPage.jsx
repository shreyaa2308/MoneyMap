import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import { centsToInput, dollarsToCents, formatCents } from '../money'

const fieldClass = 'field'

function blank() {
  return { name: '', quantity: '', purchase: '', current: '' }
}

export default function InvestmentsPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [holdings, setHoldings] = useState([])
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState(null)
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
        const rows = await api('/api/holdings')
        if (!ignore) {
          setHoldings(rows)
          setError('')
        }
      } catch (err) {
        if (!ignore) {
          if (err.status === 401) {
            logout()
            navigate('/login')
            return
          }
          setError(err.message)
        }
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

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function onSave(event) {
    event.preventDefault()
    if (saving) {
      return
    }
    const purchase = dollarsToCents(form.purchase)
    const current = dollarsToCents(form.current)
    if (!/^\d+(\.\d{1,4})?$/.test(form.quantity.trim()) || form.quantity.trim() === '0') {
      setError('Enter a quantity greater than zero, with up to 4 decimal places')
      return
    }
    if (purchase == null || current == null) {
      setError('Enter prices in dollars, such as 20.00')
      return
    }
    setSaving(true)
    const body = JSON.stringify({
      name: form.name,
      quantity: form.quantity.trim(),
      purchase_price_cents: purchase,
      current_price_cents: current,
    })
    try {
      if (editingId) {
        await api(`/api/holdings/${editingId}`, { method: 'PUT', body })
      } else {
        await api('/api/holdings', { method: 'POST', body })
      }
      setForm(blank())
      setEditingId(null)
      setError('')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(holding) {
    if (!window.confirm(`Delete ${holding.name}? This does not change account balances.`)) {
      return
    }
    try {
      await api(`/api/holdings/${holding.id}`, { method: 'DELETE' })
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  const totalValue = holdings.reduce((sum, holding) => sum + holding.current_value_cents, 0)
  const totalGain = holdings.reduce((sum, holding) => sum + holding.gain_cents, 0)

  return (
    <main className="page">
      <p className="eyebrow">Holdings</p>
      <h1 className="page-title mt-2">Investments</h1>
      <p className="note mt-3">
        Manual and simulated. You type the quantity and prices. MoneyMap does not look up live quotes or connect to a brokerage.
        Net worth adds each holding&apos;s current value once. These holdings are not also stored as cash accounts.
      </p>
      {error ? <p className="alert-error mt-4" role="alert">{error}</p> : null}
      {loading ? (
        <div className="mt-6 space-y-3" role="status">
          <p className="text-faint">Loading holdings…</p>
          <div className="skeleton h-24" />
        </div>
      ) : holdings.length === 0 ? (
        <p className="empty-panel mt-6">No holdings yet.</p>
      ) : (
        <>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <section className="card">
            <p className="text-sm text-faint">Current value</p>
            <p className="money mt-3 text-3xl font-semibold">
              {formatCents(totalValue)}
            </p>
          </section>
          <section className="card">
            <p className="text-sm text-faint">Unrealized change</p>
            <p className={totalGain < 0 ? 'money mt-3 text-3xl font-semibold text-negative' : 'money mt-3 text-3xl font-semibold text-pine'}>
              {formatCents(totalGain)}
            </p>
          </section>
        </div>
        <ul className="mt-6 space-y-3">
          {holdings.map((holding) => (
            <li key={holding.id} className="card card-hover">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{holding.name}</p>
                  <p className="text-sm text-faint">
                    {holding.quantity} × {formatCents(holding.current_price_cents)} current
                  </p>
                </div>
                <p className="money text-lg font-semibold">{formatCents(holding.current_value_cents)}</p>
              </div>
              <p className="mt-2 text-sm text-muted">
                Cost {formatCents(holding.cost_basis_cents)} · Change{' '}
                <span className={holding.gain_cents < 0 ? 'pill pill-bad money' : 'pill pill-ok money'}>
                  {formatCents(holding.gain_cents)}
                </span>
              </p>
              <div className="mt-2 flex gap-4 text-sm">
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    setEditingId(holding.id)
                    setForm({
                      name: holding.name,
                      quantity: holding.quantity,
                      purchase: centsToInput(holding.purchase_price_cents),
                      current: centsToInput(holding.current_price_cents),
                    })
                  }}
                >
                  Edit
                </button>
                <button type="button" className="text-danger" onClick={() => onDelete(holding)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      <form onSubmit={onSave} className="mt-6 grid gap-3 card sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">
          Name
          <input className={fieldClass} value={form.name} onChange={(event) => update('name', event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Quantity
          <input className={fieldClass} value={form.quantity} onChange={(event) => update('quantity', event.target.value)} placeholder="10 or 1.5" required />
        </label>
        <label className="text-sm font-medium">
          Purchase price per unit
          <input className={fieldClass} value={form.purchase} onChange={(event) => update('purchase', event.target.value)} placeholder="20.00" required />
        </label>
        <label className="text-sm font-medium">
          Current price per unit
          <input className={fieldClass} value={form.current} onChange={(event) => update('current', event.target.value)} placeholder="22.00" required />
        </label>
        <button type="submit" disabled={saving} className="self-end justify-self-start btn btn-primary">
          {saving ? 'Saving…' : editingId ? 'Save holding' : 'Add holding'}
        </button>
      </form>
    </main>
  )
}
