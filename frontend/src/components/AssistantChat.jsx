import { useEffect, useRef } from 'react'
import { useAssistant } from '../useAssistant'

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

function TypingIndicator() {
  return (
    <div className="mt-4 flex justify-start" role="status">
      <p className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-white/5 px-3.5 py-2.5 text-sm text-muted">
        <span className="flex gap-1" aria-hidden="true">
          <span className="typing-dot" />
          <span className="typing-dot typing-dot-delay-1" />
          <span className="typing-dot typing-dot-delay-2" />
        </span>
        Looking at your records…
      </p>
    </div>
  )
}

function SuggestionButton({ question, disabled, onPick, compact }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(question)}
      className={
        compact
          ? 'chip max-w-64 shrink-0 whitespace-normal'
          : 'chip'
      }
    >
      {question}
    </button>
  )
}

export default function AssistantChat({ layout = 'page', textareaRef }) {
  const { status, messages, draft, setDraft, pending, error, retry, loading, available, sendMessage } = useAssistant()
  const scrollerRef = useRef(null)
  const localInputRef = useRef(null)
  const inputRef = textareaRef || localInputRef
  const isPanel = layout === 'panel'
  const inputId = isPanel ? 'assistant-panel-question' : 'assistant-question'
  const canType = available && !pending

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) {
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    node.scrollTo({ top: node.scrollHeight, behavior: reduce ? 'auto' : 'smooth' })
  }, [messages, pending, error])

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

  const suggestionButtons = SUGGESTIONS.map((question) => (
    <SuggestionButton
      key={question}
      question={question}
      disabled={!canType}
      compact={isPanel}
      onPick={(value) => sendMessage(value, messages)}
    />
  ))

  const transcript = (
    <div
      ref={scrollerRef}
      className={
        isPanel
          ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4'
          : 'card mt-6 max-h-[32rem] min-h-52 overflow-y-auto overscroll-contain'
      }
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-busy={pending}
    >
      {loading ? <p className="text-sm text-faint">Checking the assistant…</p> : null}
      {!loading && error && !retry ? <p className="alert-error" role="alert">{error}</p> : null}
      {!loading && status && !available ? <p className="text-sm leading-6 text-muted">{status.message}</p> : null}
      {!loading && messages.length === 0 && available ? (
        <p className="text-sm leading-6 text-faint">
          Ask about this month&apos;s income, expenses, budgets, bills, or simulated holdings.
        </p>
      ) : null}
      {messages.length > 0 ? (
        <ul className="space-y-4">
          {messages.map((message, index) => {
            const mine = message.role === 'user'
            return (
              <li key={`${message.role}-${index}`} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                <div className={mine ? 'max-w-[85%] text-right' : 'max-w-[85%] text-left'}>
                  <p className="text-xs font-semibold tracking-wide text-faint uppercase">
                    {mine ? 'You' : 'Assistant'}
                  </p>
                  <p
                    className={
                      mine
                        ? 'mt-1 rounded-2xl rounded-br-md bg-[#d7f3e4] px-3.5 py-2.5 text-left text-sm leading-6 whitespace-pre-wrap text-[#102117]'
                        : 'mt-1 rounded-2xl rounded-bl-md border border-line bg-white/5 px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap text-ink'
                    }
                  >
                    {message.content}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      {pending ? <TypingIndicator /> : null}
      {error && retry ? (
        <div className="mt-4 flex flex-wrap items-center gap-3" role="alert">
          <p className="alert-error">{error}</p>
          <button type="button" onClick={() => sendMessage(retry.text, retry.base)} className="btn btn-secondary">
            Retry
          </button>
        </div>
      ) : null}
    </div>
  )

  const composer = (
    <form onSubmit={onSubmit} className={isPanel ? 'border-t border-line p-3' : 'mt-4'}>
      <label className="block text-sm font-medium" htmlFor={inputId}>
        <span className={isPanel ? 'sr-only' : undefined}>Question</span>
        <textarea
          id={inputId}
          ref={inputRef}
          className={`field mt-0 w-full resize-y ${isPanel ? 'min-h-12' : 'min-h-24'}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Summarize my spending this month."
          maxLength={1000}
          disabled={!canType}
          rows={isPanel ? 2 : 4}
          aria-describedby={`${inputId}-hint`}
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p id={`${inputId}-hint`} className="text-xs text-faint">
          Enter sends. Shift+Enter adds a line.
        </p>
        <button type="submit" disabled={!canType || !draft.trim()} className="btn btn-primary">
          {pending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )

  const suggestions = isPanel ? (
    messages.length === 0 ? (
      <div className="border-b border-line px-3 py-3">
        <p className="text-xs font-semibold tracking-wide text-faint uppercase">Suggested questions</p>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{suggestionButtons}</div>
      </div>
    ) : (
      <details className="border-b border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted">Suggested questions</summary>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">{suggestionButtons}</div>
      </details>
    )
  ) : (
    <div className="mt-6 flex flex-wrap gap-2">{suggestionButtons}</div>
  )

  return (
    <div className={isPanel ? 'flex min-h-0 flex-1 flex-col' : undefined}>
      {isPanel ? (
        <>
          {suggestions}
          {transcript}
          {composer}
        </>
      ) : (
        <>
          {suggestions}
          {transcript}
          {composer}
        </>
      )}
    </div>
  )
}
