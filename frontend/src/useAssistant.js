import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { useAuth } from './auth.js'

export function useAssistant() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [knownToken, setKnownToken] = useState(token)

  if (token !== knownToken) {
    setKnownToken(token)
    setMessages([])
    setDraft('')
    setStatus(null)
    setError('')
    setRetry(null)
    setPending(false)
    setLoading(Boolean(token))
  }

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

  return {
    status,
    messages,
    draft,
    setDraft,
    pending,
    error,
    retry,
    loading,
    available: Boolean(status?.available),
    sendMessage,
  }
}
