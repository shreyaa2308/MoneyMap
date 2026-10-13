import { useState } from 'react'
import { api } from '../api'
import { formatCents } from '../money'

export default function CsvImport({ onImported }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(path) {
    if (!file) {
      setError('Choose a CSV file first')
      return null
    }
    const body = new FormData()
    body.append('file', file)
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
      setMessage(`Imported ${result.imported_count}. Skipped ${result.duplicate_count} duplicates and ${result.invalid_count} invalid rows.`)
      onImported()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold">Import CSV</h2>
      <p className="mt-1 text-sm text-slate-600">
        Columns: date, description, amount, type, category, account. Amount is a positive number of dollars.
        Type is income or expense. The file is checked before anything is saved. Nothing is stored on disk.
      </p>
      <form onSubmit={onPreview} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={(event) => {
            setFile(event.target.files?.[0] || null)
            setPreview(null)
            setMessage('')
          }}
        />
        <button type="submit" disabled={busy} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm">
          Preview
        </button>
        <button
          type="button"
          disabled={busy || !preview}
          onClick={onImport}
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Import valid rows
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-teal-800">{message}</p> : null}
      {preview ? (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-slate-600">
            {preview.valid_count} valid, {preview.duplicate_count} duplicates, {preview.invalid_count} invalid.
          </p>
          <table className="mt-2 w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3">Row</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.row_number} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{row.row_number}</td>
                  <td className="py-2 pr-3">{row.status}</td>
                  <td className="py-2 pr-3">{row.description || '—'}</td>
                  <td className="py-2 pr-3">{row.amount_cents == null ? '—' : formatCents(row.amount_cents)}</td>
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