import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import { openPlaidLink } from '../plaidLink'

function syncMessage(result) {
  const parts = []
  if (result.added) {
    parts.push(`${result.added} imported`)
  }
  if (result.updated) {
    parts.push(`${result.updated} updated`)
  }
  if (result.removed) {
    parts.push(`${result.removed} removed`)
  }
  if (parts.length === 0) {
    return 'No new transactions.'
  }
  return `Sync finished: ${parts.join(', ')}.`
}

export default function BankConnection({ onChanged }) {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [action, setAction] = useState('')
  const [pending, setPending] = useState(null)

  useEffect(() => {
    if (!token) {
      return undefined
    }
    let ignore = false
    async function load() {
      try {
        const next = await api('/api/plaid/status')
        if (!ignore) {
          setStatus(next)
          setError('')
        }
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
  }, [token, logout, navigate])

  if (!token || (!status && !error)) {
    return null
  }

  async function refresh() {
    const next = await api('/api/plaid/status')
    setStatus(next)
    return next
  }

  function handleAuthError(err) {
    if (err.status === 401) {
      logout()
      navigate('/login')
      return true
    }
    return false
  }

  async function onConnect() {
    setAction('connect')
    setError('')
    setMessage('')
    try {
      const created = await api('/api/plaid/link-token', { method: 'POST' })
      const linked = await openPlaidLink(created.link_token)
      if (!linked) {
        return
      }
      const connection = await api('/api/plaid/items', {
        method: 'POST',
        body: JSON.stringify({
          public_token: linked.publicToken,
          institution_name: linked.institutionName,
        }),
      })
      await refresh()
      const result = await api(`/api/plaid/items/${connection.id}/sync`, { method: 'POST' })
      setMessage(syncMessage(result))
      onChanged()
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err.message)
      }
    } finally {
      setAction('')
    }
  }

  async function onSync(connection) {
    setAction('sync')
    setError('')
    setMessage('')
    try {
      const result = await api(`/api/plaid/items/${connection.id}/sync`, { method: 'POST' })
      setMessage(syncMessage(result))
      onChanged()
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err.message)
      }
    } finally {
      setAction('')
    }
  }

  async function confirmDisconnect() {
    setAction('disconnect')
    setError('')
    setMessage('')
    try {
      await api(`/api/plaid/items/${pending.id}`, { method: 'DELETE' })
      setPending(null)
      setMessage('Disconnected. Imported transactions are still in MoneyMap.')
      await refresh()
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(err.message)
      }
    } finally {
      setAction('')
    }
  }

  const connections = status?.connections || []

  return (
    <section className="card mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Bank connection</p>
          <p className="mt-1 max-w-2xl text-sm text-faint">{status?.message || error}</p>
        </div>
        {status?.available ? (
          <button type="button" className="btn btn-secondary" onClick={onConnect} disabled={Boolean(action)}>
            {action === 'connect' ? 'Connecting…' : 'Connect bank'}
          </button>
        ) : null}
      </div>
      {error ? <p className="alert-error mt-3" role="alert">{error}</p> : null}
      {message ? <p className="alert-ok mt-3" role="status">{message}</p> : null}
      {connections.length > 0 ? (
        <ul className="mt-4 list">
          {connections.map((connection) => (
            <li key={connection.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="font-medium">{connection.institution_name}</p>
              <div className="flex items-center gap-4">
                {status?.available ? (
                  <button type="button" className="text-action" onClick={() => onSync(connection)} disabled={Boolean(action)}>
                    {action === 'sync' ? 'Syncing…' : 'Sync'}
                  </button>
                ) : null}
                <button type="button" className="text-danger" onClick={() => setPending(connection)} disabled={Boolean(action)}>
                  Disconnect
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {pending ? (
        <div className="note mt-4">
          <p>
            Disconnect {pending.institution_name}? Imported transactions stay in MoneyMap. Future syncs stop.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="btn btn-danger" onClick={confirmDisconnect} disabled={Boolean(action)}>
              {action === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setPending(null)} disabled={Boolean(action)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
