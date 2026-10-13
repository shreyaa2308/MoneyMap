import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import { Icon } from '../icons.jsx'

const BRIEF_PROMPT =
  'Give me a short financial brief of three insights based only on my saved MoneyMap records. Cover cash flow, the largest spending area, and budgets or upcoming bills. Use only the figures you were given. Do not invent numbers.'

const cache = new Map()
let pendingBrief = null
let pendingToken = ''

function readCached(token) {
  const hit = cache.get(token)
  if (!hit) {
    return null
  }
  if (Date.now() - hit.at > 10 * 60 * 1000) {
    cache.delete(token)
    return null
  }
  return hit
}

function loadBrief(token, force) {
  if (!force) {
    const hit = readCached(token)
    if (hit) {
      return Promise.resolve(hit)
    }
    if (pendingBrief && pendingToken === token) {
      return pendingBrief
    }
  }
  pendingToken = token
  const request = api('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message: BRIEF_PROMPT, history: [] }),
  })
    .then((data) => {
      const hit = {
        reply: data.reply,
        disclaimer: data.disclaimer || '',
        at: Date.now(),
      }
      cache.set(token, hit)
      return hit
    })
    .finally(() => {
      if (pendingBrief === request) {
        pendingBrief = null
      }
    })
  pendingBrief = request
  return request
}

export default function AiBrief() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [brief, setBrief] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [knownToken, setKnownToken] = useState(token)

  if (token !== knownToken) {
    setKnownToken(token)
    setStatus(null)
    setBrief(null)
    setError('')
    setPending(Boolean(token))
  }

  useEffect(() => {
    if (!token) {
      return undefined
    }
    let ignore = false

    async function run() {
      setPending(true)
      setError('')
      try {
        const next = await api('/api/ai/status')
        if (ignore) {
          return
        }
        setStatus(next)
        if (!next.available) {
          setBrief(null)
          setPending(false)
          return
        }
        const result = await loadBrief(token, attempt > 0)
        if (ignore) {
          return
        }
        setBrief(result)
        setPending(false)
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
        setPending(false)
      }
    }

    run()
    return () => {
      ignore = true
    }
  }, [token, attempt, logout, navigate])

  const available = Boolean(status?.available)

  return (
    <section className="card card-raised card-accent flex h-full min-h-64 flex-col" aria-live="polite" aria-busy={pending}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Assistant</p>
          <h2 className="mt-1 text-xl font-semibold">Financial brief</h2>
          <p className="mt-1 text-sm text-faint">Generated from the records in this account.</p>
        </div>
        {available ? (
          <button
            type="button"
            className="btn btn-secondary gap-2 px-3"
            onClick={() => setAttempt((value) => value + 1)}
            disabled={pending}
          >
            <Icon name="refresh" size={16} />
            {pending ? 'Updating…' : 'Refresh'}
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex-1">
        {pending && !brief ? (
          <div role="status">
            <div className="space-y-2" aria-hidden="true">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-11/12" />
              <div className="skeleton h-3 w-4/5" />
            </div>
            <p className="mt-3 text-sm text-faint">Preparing a brief from your records…</p>
          </div>
        ) : null}
        {pending && brief ? <p className="mb-3 text-sm text-faint">Updating the brief…</p> : null}
        {brief?.reply ? <p className="text-sm leading-7 whitespace-pre-wrap text-ink">{brief.reply}</p> : null}
        {!pending && status && !available ? <p className="text-sm leading-6 text-muted">{status.message}</p> : null}
        {!pending && error ? (
          <div className="space-y-3" role="alert">
            <p className="alert-error">{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </button>
          </div>
        ) : null}
        {!pending && available && brief && !brief.reply ? (
          <p className="text-sm text-faint">The assistant did not return a brief.</p>
        ) : null}
      </div>

      {brief?.reply ? (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <p className="text-xs leading-5 text-faint">{brief.disclaimer}</p>
          <Link to="/assistant" className="btn btn-secondary w-full">
            Open assistant
          </Link>
        </div>
      ) : null}
    </section>
  )
}
