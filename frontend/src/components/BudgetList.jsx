import { useState } from 'react'
import { api } from '../api'
import { centsToInput, dollarsToCents, formatCents } from '../money'

const statusLabel = {
  under: 'On track',
  approaching: 'Approaching limit',
  over: 'Over budget',
}

const statusClass = {
  under: 'bg-teal-700',
  approaching: 'bg-amber-500',
  over: 'bg-rose-700',
}

export default function BudgetList({ budgets, month, categories, onChange }) {
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [error, setError] = useState('')

  const budgetedIds = new Set(budgets.map((budget) => budget.category_id))
  const available = categories.filter(
    (category) => category.kind === 'expense' && !budgetedIds.has(category.id),
  )

  async function onCreate(event) {
    event.preventDefault()
    const limitCents = dollarsToCents(amount)
    if (limitCents == null) {
      setError('Enter a positive spending limit, such as 80.00')
      return
    }
    try {
      await api('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          category_id: Number(categoryId),
          month,
          limit_cents: limitCents,
        }),
      })
      setAmount('')
      setCategoryId('')
      setError('')
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  async function onSave(budget) {
    const limitCents = dollarsToCents(editAmount)
    if (limitCents == null) {
      setError('Enter a positive spending limit, such as 80.00')
      return
    }
    try {
      await api(`/api/budgets/${budget.id}`, {
        method: 'PUT',
        body: JSON.stringify({ limit_cents: limitCents }),
      })
      setEditingId(null)
      setError('')
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  async function onDelete(budget) {
    const confirmed = window.confirm(`Delete the ${budget.category_name} budget?`)
    if (!confirmed) {
      return
    }
    try {
      await api(`/api/budgets/${budget.id}`, { method: 'DELETE' })
      setError('')
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      {budgets.length === 0 ? (
        <p className="text-sm text-slate-500">No budgets for this month yet.</p>
      ) : (
        <ul className="space-y-4">
          {budgets.map((budget) => {
            const width = Math.min(budget.percent_used, 100)
            return (
              <li key={budget.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{budget.category_name}</p>
                  <p className="text-sm text-slate-600">
                    {formatCents(-budget.spent_cents)} of {formatCents(budget.limit_cents)} · {statusLabel[budget.status]}
                  </p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full ${statusClass[budget.status]}`}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {budget.remaining_cents >= 0
                    ? `${formatCents(budget.remaining_cents)} left`
                    : `${formatCents(-budget.remaining_cents)} over`}
                  {' · '}
                  {budget.percent_used}% used
                </p>
                {editingId === budget.id ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2"
                      value={editAmount}
                      onChange={(event) => setEditAmount(event.target.value)}
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      onClick={() => onSave(budget)}
                      className="rounded-md bg-teal-800 px-3 py-2 text-sm text-white"
                    >
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-sm text-slate-600">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-4 text-sm">
                    <button
                      type="button"
                      className="text-teal-800"
                      onClick={() => {
                        setEditingId(budget.id)
                        setEditAmount(centsToInput(budget.limit_cents))
                      }}
                    >
                      Edit limit
                    </button>
                    <button type="button" className="text-rose-700" onClick={() => onDelete(budget)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={onCreate} className="mt-6 grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
        <label className="text-sm font-medium">
          Spending category
          <select
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            required
          >
            <option value="">Choose a category</option>
            {available.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Limit
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="80.00"
            inputMode="decimal"
            required
          />
        </label>
        <button type="submit" className="self-end rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white">
          Add budget
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
    </div>
  )
}
