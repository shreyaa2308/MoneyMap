import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import { centsToInput, dollarsToCents, formatCents, todayInput } from '../money'

const fieldClass = 'field'

function blank() {
  return { name: '', amount: '', frequency: 'monthly', category_id: '', next_due_on: todayInput() }
}

export default function BillsPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [bills, setBills] = useState([])
  const [payments, setPayments] = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(blank)
  const [editingId, setEditingId] = useState(null)
  const [payAccount, setPayAccount] = useState('')
  const [payingId, setPayingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
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
        const [billRows, paymentRows, accountRows, categoryRows] = await Promise.all([
          api('/api/bills'),
          api('/api/bills/payments'),
          api('/api/accounts'),
          api('/api/categories'),
        ])
        if (ignore) {
          return
        }
        setBills(billRows)
        setPayments(paymentRows)
        setAccounts(accountRows)
        setCategories(categoryRows.filter((category) => category.kind === 'expense'))
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

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function onSave(event) {
    event.preventDefault()
    if (saving) {
      return
    }
    const amount = dollarsToCents(form.amount)
    if (amount == null) {
      setError('Enter a positive amount, such as 15.99')
      return
    }
    const wasEditing = Boolean(editingId)
    setSaving(true)
    const body = JSON.stringify({
      name: form.name,
      amount_cents: amount,
      frequency: form.frequency,
      category_id: Number(form.category_id),
      next_due_on: form.next_due_on,
    })
    try {
      if (editingId) {
        await api(`/api/bills/${editingId}`, { method: 'PUT', body })
      } else {
        await api('/api/bills', { method: 'POST', body })
      }
      setForm(blank())
      setEditingId(null)
      setError('')
      setMessage(wasEditing ? 'Bill updated.' : 'Bill added.')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onPay(bill) {
    if (!payAccount || payingId !== bill.id) {
      setError('Choose an account, then mark the bill paid')
      return
    }
    const confirmed = window.confirm(
      `Create an expense of ${formatCents(bill.amount_cents)} for ${bill.name} on ${bill.next_due_on}? This does not charge a bank.`,
    )
    if (!confirmed) {
      return
    }
    try {
      await api(`/api/bills/${bill.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ account_id: Number(payAccount) }),
      })
      setPayingId(null)
      setPayAccount('')
      setError('')
      setMessage('Expense saved. The next due date moved forward.')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function onDelete(bill) {
    if (!window.confirm(`Delete ${bill.name}? Expenses already created stay in Transactions.`)) {
      return
    }
    try {
      await api(`/api/bills/${bill.id}`, { method: 'DELETE' })
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  const overdue = bills.filter((bill) => bill.status === 'overdue')
  const upcoming = bills.filter((bill) => bill.status === 'upcoming')

  function renderBill(bill) {
    return (
      <li key={bill.id} className="card card-hover">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">{bill.name}</p>
            <p className="text-sm text-faint">
              {formatCents(bill.amount_cents)} · {bill.frequency} · {bill.category_name}
            </p>
            <p className="text-sm text-muted">
              Next due {bill.next_due_on}
              {bill.last_paid_on ? ` · Last paid ${bill.last_paid_on}` : ''}
            </p>
          </div>
          <span className={bill.status === 'overdue' ? 'pill pill-bad' : 'pill pill-ok'}>
            {bill.status === 'overdue' ? 'Overdue' : 'Upcoming'}
          </span>
        </div>
        {payingId === bill.id ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-sm font-medium">
              Pay from
              <select className={fieldClass} value={payAccount} onChange={(event) => setPayAccount(event.target.value)}>
                <option value="">Choose an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => onPay(bill)} className="btn btn-primary">
              Create expense
            </button>
            <button type="button" onClick={() => setPayingId(null)} className="text-sm text-muted">
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setPayingId(bill.id)
                setPayAccount('')
              }}
            >
              Mark paid
            </button>
            <button
              type="button"
              className="text-action"
              onClick={() => {
                setEditingId(bill.id)
                setForm({
                  name: bill.name,
                  amount: centsToInput(bill.amount_cents),
                  frequency: bill.frequency,
                  category_id: String(bill.category_id),
                  next_due_on: bill.next_due_on,
                })
              }}
            >
              Edit
            </button>
            <button type="button" className="text-danger" onClick={() => onDelete(bill)}>
              Delete
            </button>
          </div>
        )}
      </li>
    )
  }

  return (
    <main className="page">
      <p className="eyebrow">Schedule</p>
      <h1 className="page-title mt-2">Bills</h1>
      <p className="lede">
        Marking a bill paid creates one expense for that due date. It does not charge a bank, and the same due date cannot be paid twice.
      </p>
      {error ? <p className="alert-error mt-4" role="alert">{error}</p> : null}
      {message ? <p className="alert-ok mt-4">{message}</p> : null}
      {loading ? (
        <div className="mt-6 space-y-3" role="status">
          <p className="text-faint">Loading bills…</p>
          <div className="skeleton h-24" />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <section className="card">
              <p className="text-sm text-faint">Overdue</p>
              <p className={overdue.length > 0 ? 'money mt-3 text-3xl font-semibold text-negative' : 'money mt-3 text-3xl font-semibold'}>{overdue.length}</p>
            </section>
            <section className="card">
              <p className="text-sm text-faint">Upcoming</p>
              <p className="money mt-3 text-3xl font-semibold text-pine">{upcoming.length}</p>
            </section>
            <section className="card">
              <p className="text-sm text-faint">Payments recorded</p>
              <p className="money mt-3 text-3xl font-semibold">{payments.length}</p>
            </section>
          </div>
          <h2 className="mt-6 text-lg font-semibold">Overdue</h2>
          {overdue.length === 0 ? <p className="empty-panel mt-3">Nothing overdue.</p> : <ul className="mt-3 space-y-3">{overdue.map(renderBill)}</ul>}
          <h2 className="mt-6 text-lg font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? <p className="empty-panel mt-3">No upcoming bills.</p> : <ul className="mt-3 space-y-3">{upcoming.map(renderBill)}</ul>}
          <h2 className="mt-6 text-lg font-semibold">Paid</h2>
          {payments.length === 0 ? (
            <p className="empty-panel mt-3">No payments yet.</p>
          ) : (
            <ul className="mt-3 list">
              {payments.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    {payment.bill_name} · due {payment.due_on}
                  </span>
                  <span className="money font-medium text-pine">Paid {formatCents(payment.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <form onSubmit={onSave} className="mt-6 grid gap-3 card sm:grid-cols-2">
        <label className="text-sm font-medium">
          Name
          <input className={fieldClass} value={form.name} onChange={(event) => update('name', event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Amount
          <input className={fieldClass} value={form.amount} onChange={(event) => update('amount', event.target.value)} placeholder="15.99" required />
        </label>
        <label className="text-sm font-medium">
          Frequency
          <select className={fieldClass} value={form.frequency} onChange={(event) => update('frequency', event.target.value)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Category
          <select className={fieldClass} value={form.category_id} onChange={(event) => update('category_id', event.target.value)} required>
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Next due date
          <input type="date" className={fieldClass} value={form.next_due_on} onChange={(event) => update('next_due_on', event.target.value)} required />
        </label>
        <button type="submit" disabled={saving} className="self-end justify-self-start btn btn-primary">
          {saving ? 'Saving…' : editingId ? 'Save bill' : 'Add bill'}
        </button>
      </form>
    </main>
  )
}