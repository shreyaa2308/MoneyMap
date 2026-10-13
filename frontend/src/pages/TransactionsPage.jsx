import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import CsvImport from '../components/CsvImport.jsx'
import { centsToInput, dollarsToCents, formatCents, todayInput } from '../money'

const fieldClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2'

function blankForm() {
  return {
    description: '',
    amount: '',
    direction: 'expense',
    account_id: '',
    category_id: '',
    occurred_on: todayInput(),
  }
}

export default function TransactionsPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [kind, setKind] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [form, setForm] = useState(blankForm)
  const [editingId, setEditingId] = useState(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryKind, setCategoryKind] = useState('expense')
  const [error, setError] = useState('')
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
      const params = new URLSearchParams()
      if (appliedSearch) {
        params.set('q', appliedSearch)
      }
      if (kind) {
        params.set('kind', kind)
      }
      if (categoryFilter) {
        params.set('category_id', categoryFilter)
      }
      try {
        const [me, accountRows, categoryRows, transactionRows] = await Promise.all([
          api('/api/auth/me'),
          api('/api/accounts'),
          api('/api/categories'),
          api(`/api/transactions?${params.toString()}`),
        ])
        if (ignore) {
          return
        }
        setEmail(me.email)
        setAccounts(accountRows)
        setCategories(categoryRows)
        setTransactions(transactionRows)
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
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [token, appliedSearch, kind, categoryFilter, reloadKey, logout, navigate])

  const matchingCategories = categories.filter((category) => category.kind === form.direction)

  function updateForm(field, value) {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'direction') {
        const stillMatches = categories.some(
          (category) => category.kind === value && String(category.id) === current.category_id,
        )
        if (!stillMatches) {
          const replacement = categories.find((category) => category.kind === value)
          next.category_id = replacement ? String(replacement.id) : ''
        }
      }
      return next
    })
  }

  function startEdit(transaction) {
    setEditingId(transaction.id)
    setForm({
      description: transaction.description,
      amount: centsToInput(transaction.amount_cents),
      direction: transaction.amount_cents < 0 ? 'expense' : 'income',
      account_id: String(transaction.account_id),
      category_id: String(transaction.category_id),
      occurred_on: transaction.occurred_on,
    })
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(blankForm())
  }

  async function onSave(event) {
    event.preventDefault()
    const amountCents = dollarsToCents(form.amount)
    if (amountCents == null) {
      setError('Enter a positive amount in dollars, such as 12.50')
      return
    }
    const body = {
      account_id: Number(form.account_id),
      category_id: Number(form.category_id),
      amount_cents: amountCents,
      direction: form.direction,
      description: form.description,
      occurred_on: form.occurred_on,
    }
    try {
      if (editingId) {
        await api(`/api/transactions/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        })
      } else {
        await api('/api/transactions', {
          method: 'POST',
          body: JSON.stringify(body),
        })
      }
      cancelEdit()
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function onDelete(transaction) {
    const confirmed = window.confirm(`Delete ${transaction.description}?`)
    if (!confirmed) {
      return
    }
    try {
      await api(`/api/transactions/${transaction.id}`, { method: 'DELETE' })
      if (editingId === transaction.id) {
        cancelEdit()
      }
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  async function onCreateCategory(event) {
    event.preventDefault()
    try {
      const created = await api('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: categoryName, kind: categoryKind }),
      })
      setCategoryName('')
      setForm((current) => ({
        ...current,
        direction: created.kind,
        category_id: String(created.id),
      }))
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold">Transactions</h1>
      <p className="mt-2 text-slate-600">
        {email ? `Signed in as ${email}. ` : null}
        Amounts are saved in cents. Income is positive and expenses are negative.
      </p>
      {email === 'demo@moneymap.example' ? (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">
          These sample records are fictional. They are not a real bank account.
        </p>
      ) : null}
      <CsvImport onImported={() => setReloadKey((value) => value + 1)} />

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          setAppliedSearch(search.trim())
        }}
      >
        <input
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          placeholder="Search descriptions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-4 py-2">
          Search
        </button>
      </form>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Type
          <select className={fieldClass} value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Category
          <select
            className={fieldClass}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.kind})
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      <ul className="mt-6 space-y-3">
        {transactions.length === 0 ? (
          <li className="text-slate-500">No transactions match.</li>
        ) : null}
        {transactions.map((transaction) => (
          <li key={transaction.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{transaction.description}</p>
                <p className="text-sm text-slate-500">
                  {transaction.occurred_on} · {transaction.category_name} · {transaction.account_name}
                </p>
              </div>
              <p className={transaction.amount_cents < 0 ? 'font-medium text-rose-700' : 'font-medium text-teal-800'}>
                {formatCents(transaction.amount_cents)}
              </p>
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <button type="button" onClick={() => startEdit(transaction)} className="text-teal-800">
                Edit
              </button>
              <button type="button" onClick={() => onDelete(transaction)} className="text-rose-700">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={onSave} className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">{editingId ? 'Edit transaction' : 'Add transaction'}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            Description
            <input
              className={fieldClass}
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Amount in dollars
            <input
              className={fieldClass}
              inputMode="decimal"
              placeholder="12.50"
              value={form.amount}
              onChange={(event) => updateForm('amount', event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Date
            <input
              className={fieldClass}
              type="date"
              value={form.occurred_on}
              onChange={(event) => updateForm('occurred_on', event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Income or expense
            <select
              className={fieldClass}
              value={form.direction}
              onChange={(event) => updateForm('direction', event.target.value)}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Account
            <select
              className={fieldClass}
              value={form.account_id}
              onChange={(event) => updateForm('account_id', event.target.value)}
              required
            >
              <option value="">Choose an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Category
            <select
              className={fieldClass}
              value={form.category_id}
              onChange={(event) => updateForm('category_id', event.target.value)}
              required
            >
              <option value="">Choose a category</option>
              {matchingCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="submit" className="rounded-md bg-teal-800 px-4 py-2 font-medium text-white">
            {editingId ? 'Save changes' : 'Add transaction'}
          </button>
          {editingId ? (
            <button type="button" onClick={cancelEdit} className="rounded-md border border-slate-300 px-4 py-2">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <form onSubmit={onCreateCategory} className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Add a category</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Name
            <input
              className={fieldClass}
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-medium">
            Type
            <select
              className={fieldClass}
              value={categoryKind}
              onChange={(event) => setCategoryKind(event.target.value)}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
        </div>
        <button type="submit" className="mt-4 rounded-md border border-slate-300 px-4 py-2">
          Add category
        </button>
      </form>
    </main>
  )
}
