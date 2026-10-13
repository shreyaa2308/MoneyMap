import { useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth.js'
import { Icon } from '../icons.jsx'
import AssistantChat from './AssistantChat.jsx'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), summary'

export default function AssistantWidget() {
  const { token } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [trackedPath, setTrackedPath] = useState(location.pathname)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const launcherRef = useRef(null)
  const inputRef = useRef(null)
  const titleId = useId()
  const onAssistantPage = location.pathname === '/assistant'
  const visible = Boolean(token) && !onAssistantPage

  if (location.pathname !== trackedPath) {
    setTrackedPath(location.pathname)
    if (location.pathname === '/assistant') {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return undefined
    }
    const previous = document.activeElement
    const frame = window.requestAnimationFrame(() => {
      const field = inputRef.current
      if (field && !field.disabled) {
        field.focus()
      } else {
        closeRef.current?.focus()
      }
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (previous instanceof HTMLElement && document.contains(previous)) {
        previous.focus()
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return undefined
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!token) {
    return null
  }

  function openPanel() {
    setMounted(true)
    setOpen(true)
  }

  function closePanel() {
    setOpen(false)
    launcherRef.current?.focus()
  }

  function onPanelKeyDown(event) {
    if (event.key !== 'Tab' || !panelRef.current) {
      return
    }
    const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)]
    if (nodes.length === 0) {
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const showing = visible && open

  return (
    <>
      {visible ? (
        <button
          ref={launcherRef}
          type="button"
          className="assistant-fab"
          aria-haspopup="dialog"
          aria-expanded={showing}
          aria-controls={mounted ? 'assistant-panel' : undefined}
          aria-label={showing ? 'Close assistant' : 'Open assistant'}
          onClick={() => (showing ? closePanel() : openPanel())}
        >
          <Icon name={showing ? 'close' : 'chat'} size={22} />
          <span className="hidden sm:inline">{showing ? 'Close' : 'Ask'}</span>
        </button>
      ) : null}
      {showing ? (
        <button type="button" className="assistant-backdrop" tabIndex={-1} aria-label="Close assistant" onClick={closePanel} />
      ) : null}
      {mounted ? (
        <div
          id="assistant-panel"
          ref={panelRef}
          role="dialog"
          aria-modal={showing ? true : undefined}
          aria-hidden={showing ? undefined : true}
          inert={showing ? undefined : true}
          aria-labelledby={titleId}
          className={showing ? 'assistant-panel assistant-panel-open' : 'assistant-panel'}
          style={showing ? undefined : { display: 'none' }}
          onKeyDown={onPanelKeyDown}
        >
          <div className="assistant-head flex items-start justify-between gap-3 px-4 py-3.5 text-white">
            <div>
              <p id={titleId} className="text-sm font-semibold">
                MoneyMap assistant
              </p>
              <p className="mt-1 text-xs leading-5 text-white/75">
                Explains the records in this account. It cannot add, edit, or delete anything, and it is not financial,
                tax, or investment advice.
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={closePanel}
              className="rounded-full border border-white/20 px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <AssistantChat layout="panel" textareaRef={inputRef} />
        </div>
      ) : null}
    </>
  )
}
