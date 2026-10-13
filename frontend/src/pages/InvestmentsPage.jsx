import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import { centsToInput, dollarsToCents, formatCents } from '../money'

const fieldClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2'

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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold">Investments</h1>
      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Manual and simulated. You type the quantity and prices. MoneyMap does not look up live quotes or connect to a brokerage.
        Net worth adds each holding&apos;s current value once. These holdings are not also stored as cash accounts.
      </p>
      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      {loading ? (
        <p className="mt-6 text-slate-500">Loading holdings…</p>
      ) : holdings.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No holdings yet.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {holdings.map((holding) => (
            <li key={holding.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{holding.name}</p>
                  <p className="text-sm text-slate-500">
                    {holding.quantity} × {formatCents(holding.current_price_cents)} current
                  </p>
                </div>
                <p className="font-medium">{formatCents(holding.current_value_cents)}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Cost {formatCents(holding.cost_basis_cents)} · Change {formatCents(holding.gain_cents)}
              </p>
              <div className="mt-2 flex gap-4 text-sm">
                <button
                  type="button"
                  className="text-teal-800"
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
                <button type="button" className="text-rose-700" onClick={() => onDelete(holding)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onSave} className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
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
        <button type="submit" className="self-end rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white">
          {editingId ? 'Save holding' : 'Add holding'}
        </button>
      </form>
    </main>
  )
}
