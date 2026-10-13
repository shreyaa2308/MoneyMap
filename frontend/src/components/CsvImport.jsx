import { useState } from 'react'
import { api } from '../api'
import { formatCents } from '../money'

const statusClass = {
  valid: 'bg-pine/10 text-pine-deep',
  duplicate: 'bg-warning-bg text-warning',
  invalid: 'bg-negative/10 text-negative',
}

export default function CsvImport({ accounts = [], categories = [], onImported }) {
  const [file, setFile] = useState(null)
  const [accountChoice, setAccountChoice] = useState('')
  const [expenseChoice, setExpenseChoice] = useState('')
  const [incomeChoice, setIncomeChoice] = useState('')
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const expenseCategories = categories.filter((category) => category.kind === 'expense')
  const incomeCategories = categories.filter((category) => category.kind === 'income')
  const expenseDefault = expenseCategories.find((category) => category.name === 'Groceries') || expenseCategories[0]
  const incomeDefault = incomeCategories.find((category) => category.name === 'Pay') || incomeCategories[0]
  const accountId = accountChoice || (accounts[0] ? String(accounts[0].id) : '')
  const expenseCategoryId = expenseChoice || (expenseDefault ? String(expenseDefault.id) : '')
  const incomeCategoryId = incomeChoice || (incomeDefault ? String(incomeDefault.id) : '')

  function clearResult() {
    setPreview(null)
    setMessage('')
  }

  async function send(path) {
    if (!file) {
      setError('Choose a CSV file first')
      return null
    }
    const body = new FormData()
    body.append('file', file)
    if (accountId) {
      body.append('account_id', accountId)
    }
    if (expenseCategoryId) {
      body.append('expense_category_id', expenseCategoryId)
    }
    if (incomeCategoryId) {
      body.append('income_category_id', incomeCategoryId)
    }
    return api(path, { method: 'POST', body })
  }

  async function onPreview(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const result = await send('/api/imports/preview')
      setPreview(result)
      setError('')
    } catch (err) {
      setPreview(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function onImport() {
    setBusy(true)
    try {
      const result = await send('/api/imports')
      setPreview(result)
      setError('')
      if (!result || result.imported_count === 0) {
        setMessage(
          `Nothing was imported. ${result?.invalid_count ?? 0} invalid and ${result?.duplicate_count ?? 0} duplicate rows were left out.`,
        )
      } else {
        setMessage(
          `Imported ${result.imported_count}. Skipped ${result.duplicate_count} duplicates and ${result.invalid_count} invalid rows.`,
        )
        onImported()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="csv-import" className="card mt-6 scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Bank statement</p>
          <h2 className="mt-1 text-xl font-semibold">Import CSV</h2>
        </div>
        <a href="/sample-bank-statement.csv" download className="btn btn-secondary">
          Download sample CSV
        </a>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-muted">
        <p>
          Preview runs first. Valid rows are saved only when you import them. Invalid and duplicate rows stay in the
          report and are not added.
        </p>
        <p>
          MoneyMap columns: date, description, amount, type, category, account. Type is income or expense, and amount
          is a positive number of dollars.
        </p>
        <p>
          A bank export can use transaction date, posted date, description, memo, amount, and transaction type
          (Debit or Credit). Separate Debit and Credit columns work too. Dates can be YYYY-MM-DD or MM/DD/YYYY. A
          negative amount is an expense. If the file has no account or category column, the choices below are used.
          The sample file is fictional.
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium">
          Account when the file has none
          <select
            className="field"
            value={accountId}
            onChange={(event) => {
              setAccountChoice(event.target.value)
              clearResult()
            }}
          >
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Expense category
          <select
            className="field"
            value={expenseCategoryId}
            onChange={(event) => {
              setExpenseChoice(event.target.value)
              clearResult()
            }}
          >
            <option value="">Choose a category</option>
            {expenseCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Income category
          <select
            className="field"
            value={incomeCategoryId}
            onChange={(event) => {
              setIncomeChoice(event.target.value)
              clearResult()
            }}
          >
            <option value="">Choose a category</option>
            {incomeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form onSubmit={onPreview} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null)
            clearResult()
            setError('')
          }}
        />
        <button type="submit" disabled={busy} className="btn btn-secondary">
          {busy ? 'Checking…' : 'Preview'}
        </button>
        <button type="button" disabled={busy || !preview} onClick={onImport} className="btn btn-primary">
          Import valid rows
        </button>
      </form>
      {error ? <p className="alert-error mt-3">{error}</p> : null}
      {message ? <p className="alert-ok mt-3">{message}</p> : null}
      {preview ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <p className="text-sm text-muted">
            {preview.valid_count} ready to import, {preview.duplicate_count} duplicates, {preview.invalid_count} invalid.
            {preview.imported_count === 0 ? ' Nothing has been saved yet.' : ` ${preview.imported_count} saved.`}
          </p>
          <table className="mt-3 w-full min-w-[42rem] text-left text-sm">
            <thead className="bg-white/5">
              <tr className="border-b border-line text-faint">
                <th className="py-2 pr-3 font-medium">Row</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.row_number} className="border-b border-line/80 transition hover:bg-white/5">
                  <td className="py-2 pr-3">{row.row_number}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusClass[row.status] || ''}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.occurred_on || '—'}</td>
                  <td className="py-2 pr-3">{row.description || '—'}</td>
                  <td className={`money py-2 pr-3 ${row.amount_cents < 0 ? 'text-negative' : 'text-pine'}`}>
                    {row.amount_cents == null ? '—' : formatCents(row.amount_cents)}
                  </td>
                  <td className="py-2 pr-3">{row.account || '—'}</td>
                  <td className="py-2">{row.errors.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
