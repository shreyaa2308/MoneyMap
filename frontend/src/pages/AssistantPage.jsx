import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'

const SUGGESTIONS = [
  'Summarize my spending this month.',
  'Which categories account for most of my expenses?',
  'How am I doing against my budgets?',
  'Compare this month with last month.',
  'What recurring bills are coming up?',
  'Give me three practical ways to reduce my discretionary spending.',
  'Explain why my net cash flow changed.',
  'Summarize my financial position using my recorded accounts and simulated holdings.',
]

export default function AssistantPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(null)
  const [loading, setLoading] = useState(true)

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
        const next = await api('/api/ai/status')
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
  }, [token, logout, navigate])

  async function sendMessage(text, baseMessages) {
    const trimmed = text.trim()
    if (!trimmed || pending || !status?.available) {
      return
    }
    const history = baseMessages.slice(-6).map((item) => ({
      role: item.role,
      content: item.content.slice(0, 4000),
    }))
    const userMessage = { role: 'user', content: trimmed }
    setMessages([...baseMessages, userMessage])
    setDraft('')
    setPending(true)
    setError('')
    setRetry(null)
    try {
      const data = await api('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed, history }),
      })
      setMessages([...baseMessages, userMessage, { role: 'assistant', content: data.reply }])
    } catch (err) {
      if (err.status === 401) {
        logout()
        navigate('/login')
        return
      }
      setError(err.message)
      setRetry({ text: trimmed, base: baseMessages })
    } finally {
      setPending(false)
    }
  }

  function onSubmit(event) {
    event.preventDefault()
    sendMessage(draft, messages)
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage(draft, messages)
    }
  }

  const available = Boolean(status?.available)

  return (
    <main className="page">
      <h1 className="page-title">Assistant</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Ask about the records in this account. MoneyMap calculates the totals first, and the assistant explains them.
        It cannot add, edit, or delete anything.
      </p>
      <p className="note mt-3">
        This is a plain-language explanation of your MoneyMap records. It is not professional financial, tax, or
        investment advice. Holdings are simulated prices you entered.
      </p>

      {loading ? <p className="mt-6 text-faint">Checking the assistant…</p> : null}
      {!loading && error && !retry ? <p className="alert-error mt-4">{error}</p> : null}
      {!loading && status && !available ? (
        <p className="card mt-4 text-sm text-muted">{status.message}</p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {SUGGESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            disabled={!available || pending}
            onClick={() => sendMessage(question, messages)}
            className="btn btn-secondary text-left disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>

      <section className="mt-6 card" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm text-faint">
            No questions yet. Choose a suggestion or ask about this month&apos;s income, expenses, budgets, bills, or
            simulated holdings.
          </p>
        ) : (
          <ul className="space-y-4">
            {messages.map((message, index) => (
              <li key={`${message.role}-${index}`} className={message.role === 'user' ? 'text-right' : ''}>
                <p className="text-xs font-medium uppercase tracking-wide text-faint">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </p>
                <p
                  className={
                    message.role === 'user'
                      ? 'mt-1 inline-block max-w-full whitespace-pre-wrap rounded-2xl bg-navy px-3 py-2 text-left text-sm text-white'
                      : 'mt-1 whitespace-pre-wrap rounded-2xl bg-paper px-3 py-2 text-sm leading-6 text-ink'
                  }
                >
                  {message.content}
                </p>
              </li>
            ))}
          </ul>
        )}
        {pending ? <p className="mt-4 text-sm text-faint">Looking at your records…</p> : null}
        {error && retry ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="alert-error">{error}</p>
            <button
              type="button"
              onClick={() => sendMessage(retry.text, retry.base)}
              className="btn btn-secondary"
            >
              Retry
            </button>
          </div>
        ) : null}
      </section>

      <form onSubmit={onSubmit} className="mt-4">
        <label className="block text-sm font-medium" htmlFor="assistant-question">
          Question
          <textarea
            id="assistant-question"
            className="field min-h-24"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Summarize my spending this month."
            maxLength={1000}
            disabled={!available || pending}
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-faint">Enter sends. Shift+Enter adds a line.</p>
          <button
            type="submit"
            disabled={!available || pending || !draft.trim()}
            className="btn btn-primary"
          >
            {pending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </main>
  )
}
