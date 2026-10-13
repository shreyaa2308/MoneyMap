import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import CsvImport from '../components/CsvImport.jsx'
import { centsToInput, dollarsToCents, formatCents, todayInput } from '../money'

const fieldClass = 'field'

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
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [kind, setKind] = useState('')
  const categoryFilter = searchParams.get('category_id') || ''
  const [form, setForm] = useState(blankForm)
  const [editingId, setEditingId] = useState(null)
  const [accountFilter, setAccountFilter] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [categoryKind, setCategoryKind] = useState('expense')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const scrolledHash = useRef('')

  useEffect(() => {
    if (!token) {
      navigate('/login')
    }
  }, [token, navigate])

  useEffect(() => {
    if (!location.hash || loading) {
      return
    }
    if (scrolledHash.current === location.hash) {
      return
    }
    const node = document.getElementById(location.hash.slice(1))
    if (!node) {
      return
    }
    scrolledHash.current = location.hash
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [location.hash, loading])

  function updateCategoryFilter(value) {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set('category_id', value)
    } else {
      next.delete('category_id')
    }
    setSearchParams(next, { replace: true })
  }

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
      if (accountFilter) {
        params.set('account_id', accountFilter)
      }
      setLoading(true)
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
        setError(err.message || 'Transactions could not be loaded.')
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
  }, [token, appliedSearch, kind, categoryFilter, accountFilter, reloadKey, logout, navigate])

  const matchingCategories = categories.filter((category) => category.kind === form.direction)
  const selectedCategory = categories.find((category) => String(category.id) === categoryFilter)
  const suggestedAccountId = accounts[0] ? String(accounts[0].id) : ''
  const suggestedCategoryId = matchingCategories[0] ? String(matchingCategories[0].id) : ''
  const formAccountId = form.account_id || suggestedAccountId
  const formCategoryId = form.category_id || suggestedCategoryId

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
    if (saving) {
      return
    }
    const amountCents = dollarsToCents(form.amount)
    if (amountCents == null) {
      setError('Enter a positive amount in dollars, such as 12.50')
      return
    }
    if (!formAccountId) {
      setError('Choose an account')
      return
    }
    if (!formCategoryId) {
      setError('Choose a category that matches income or expense')
      return
    }
    if (!form.occurred_on) {
      setError('Choose a date')
      return
    }
    const body = {
      account_id: Number(formAccountId),
      category_id: Number(formCategoryId),
      amount_cents: amountCents,
      direction: form.direction,
      description: form.description,
      occurred_on: form.occurred_on,
    }
    const wasEditing = Boolean(editingId)
    setSaving(true)
    setMessage('')
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
      setError('')
      setMessage(wasEditing ? 'Transaction updated.' : 'Transaction added.')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(transaction) {
    const confirmed = window.confirm(`Delete ${transaction.description}?`)
    if (!confirmed) {
      return
    }
    if (saving) {
      return
    }
    setSaving(true)
    try {
      await api(`/api/transactions/${transaction.id}`, { method: 'DELETE' })
      if (editingId === transaction.id) {
        cancelEdit()
      }
      setError('')
      setMessage('Transaction deleted.')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function onCreateCategory(event) {
    event.preventDefault()
    if (saving) {
      return
    }
    setSaving(true)
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
      setError('')
      setMessage('Category added.')
      setReloadKey((value) => value + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">Activity</p>
      <h1 className="page-title mt-2">Transactions</h1>
      <p className="lede">
        {email ? `Signed in as ${email}. ` : null}
        Amounts are saved in cents. Income is positive and expenses are negative.
      </p>
      {email === 'demo@moneymap.example' ? (
        <p className="note mt-3">
          These sample records are fictional. They are not a real bank account.
        </p>
      ) : null}
      <CsvImport
        accounts={accounts}
        categories={categories}
        onImported={() => setReloadKey((value) => value + 1)}
      />

      <section className="card mt-6">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          setAppliedSearch(search.trim())
        }}
      >
        <input
          className="field"
          placeholder="Search descriptions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit" className="btn btn-secondary">
          Search
        </button>
      </form>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
            onChange={(event) => updateCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} ({category.kind})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Account
          <select
            className={fieldClass}
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {categoryFilter ? (
        <p className="mt-4 text-sm text-muted">
          Filtered to {selectedCategory ? selectedCategory.name : 'the selected category'}.{' '}
          <button type="button" className="font-semibold text-pine-deep hover:underline" onClick={() => updateCategoryFilter('')}>
            Show all categories
          </button>
        </p>
      ) : null}
      </section>
      {error ? <p className="alert-error mt-4" role="alert">{error}</p> : null}
      {message ? <p className="alert-ok mt-4">{message}</p> : null}

      <ul className="mt-6 space-y-3">
        {loading && transactions.length === 0 ? (
          <li className="space-y-3" role="status">
            <p className="text-faint">Loading transactions…</p>
            <div className="skeleton h-20" />
          </li>
        ) : null}
        {!loading && transactions.length === 0 ? (
          <li className="empty-panel">
            {error ? 'Transactions could not be loaded.' : 'No transactions match.'}
          </li>
        ) : null}
        {transactions.map((transaction) => (
          <li key={transaction.id} className="card card-hover">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{transaction.description}</p>
                <p className="text-sm text-faint">
                  {transaction.occurred_on} · {transaction.category_name} · {transaction.account_name}
                </p>
              </div>
              <p className={transaction.amount_cents < 0 ? 'money font-medium text-negative' : 'money font-medium text-pine'}>
                {formatCents(transaction.amount_cents)}
              </p>
            </div>
            <div className="mt-3 flex gap-4 text-sm">
              <button type="button" onClick={() => startEdit(transaction)} disabled={saving} className="text-action">
                Edit
              </button>
              <button type="button" onClick={() => onDelete(transaction)} disabled={saving} className="text-danger">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form id="add-transaction" onSubmit={onSave} className="mt-8 card scroll-mt-24">
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
              value={formAccountId}
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
              value={formCategoryId}
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
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add transaction'}
          </button>
          {editingId ? (
            <button type="button" onClick={cancelEdit} className="btn btn-secondary">
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <form onSubmit={onCreateCategory} className="mt-6 card">
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
        <button type="submit" disabled={saving} className="mt-4 btn btn-secondary disabled:opacity-50">
          {saving ? 'Saving…' : 'Add category'}
        </button>
      </form>
    </main>
  )
}
