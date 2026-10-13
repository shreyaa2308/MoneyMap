import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.js'
import { BrandMark, Icon } from '../icons.jsx'
import AssistantWidget from './AssistantWidget.jsx'

const NAV = [
  ['/dashboard', 'Dashboard', 'dashboard'],
  ['/transactions', 'Transactions', 'transactions'],
  ['/accounts', 'Accounts', 'accounts'],
  ['/investments', 'Investments', 'investments'],
  ['/bills', 'Bills', 'bills'],
  ['/assistant', 'Assistant', 'assistant'],
]

function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    function onChange() {
      setMatches(media.matches)
    }
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

function readCollapsed() {
  try {
    return localStorage.getItem('moneymap_sidebar') === 'collapsed'
  } catch {
    return false
  }
}

export default function AppShell({ children }) {
  const { token, email, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isDesktop = useMedia('(min-width: 1024px)')
  const isTablet = useMedia('(min-width: 768px)')
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [menuPath, setMenuPath] = useState(null)
  const drawerOpen = menuPath != null && menuPath === location.pathname
  const wide = isDesktop ? !collapsed : drawerOpen
  const sidebarHidden = !isTablet && !drawerOpen

  function closeDrawer() {
    setMenuPath(null)
  }

  function openDrawer() {
    setMenuPath(location.pathname)
  }

  useEffect(() => {
    if (!drawerOpen || isDesktop) {
      return undefined
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setMenuPath(null)
      }
    }
    document.addEventListener('keydown', onKey)
    if (isTablet) {
      return () => document.removeEventListener('keydown', onKey)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [drawerOpen, isDesktop, isTablet])

  function onLogout() {
    closeDrawer()
    logout()
    navigate('/login')
  }

  function toggleSidebar() {
    if (isDesktop) {
      setCollapsed((current) => {
        const next = !current
        try {
          localStorage.setItem('moneymap_sidebar', next ? 'collapsed' : 'expanded')
        } catch {
          // Private browsing can block storage. The toggle still works for this visit.
        }
        return next
      })
      return
    }
    if (drawerOpen) {
      closeDrawer()
    } else {
      openDrawer()
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen text-ink">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="sticky top-0 z-20 border-b border-white/10 bg-navy text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-lg font-semibold tracking-tight">MoneyMap</span>
            </Link>
            <nav className="flex items-center gap-1.5" aria-label="Account">
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  isActive
                    ? 'rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white'
                    : 'rounded-full px-3 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 hover:text-white'
                }
              >
                Log in
              </NavLink>
              <NavLink to="/register" className="btn btn-primary px-3 py-2">
                Register
              </NavLink>
            </nav>
          </div>
        </header>
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    )
  }

  const sidebarClass = ['sidebar', collapsed ? 'is-collapsed' : '', drawerOpen ? 'is-open' : ''].filter(Boolean).join(' ')

  return (
    <div className="app-frame text-ink">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {drawerOpen && !isDesktop ? (
        <button type="button" className="sidebar-backdrop" aria-label="Close menu" onClick={closeDrawer} />
      ) : null}
      <aside
        id="app-sidebar"
        className={sidebarClass}
        aria-label="Main"
        aria-hidden={sidebarHidden ? true : undefined}
        inert={sidebarHidden ? true : undefined}
      >
        <div className="sidebar-scroll">
          <Link to="/" className="brand" title={wide ? undefined : 'MoneyMap'} onClick={closeDrawer}>
            <BrandMark />
            <span className="brand-copy">
              <span className="brand-name">MoneyMap</span>
              <span className="brand-tag">Personal finance</span>
            </span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV.map(([to, label, icon]) => (
              <NavLink
                key={to}
                to={to}
                className="nav-link"
                title={wide ? undefined : label}
                onClick={closeDrawer}
              >
                <Icon name={icon} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-footer">
            {email ? (
              <div className="user-chip" title={email}>
                <span className="user-avatar" aria-hidden="true">
                  {email.charAt(0).toUpperCase()}
                </span>
                <span className="nav-label user-email">{email}</span>
              </div>
            ) : null}
            <button
              type="button"
              className="nav-link"
              aria-expanded={wide}
              aria-controls="app-sidebar"
              title={wide ? 'Collapse sidebar' : 'Expand sidebar'}
              onClick={toggleSidebar}
            >
              <span className={wide ? 'inline-flex' : 'inline-flex rotate-180'}>
                <Icon name="chevron" />
              </span>
              <span className="collapse-label">{wide ? 'Collapse' : 'Expand'}</span>
            </button>
            <button type="button" className="nav-link" title={wide ? undefined : 'Log out'} onClick={onLogout}>
              <Icon name="logout" />
              <span className="nav-label">Log out</span>
            </button>
          </div>
        </div>
      </aside>
      <div id="main-content" tabIndex={-1} className="app-main">
        <header className="mobile-bar flex md:hidden">
          <button
            type="button"
            className="btn btn-secondary px-3 py-2"
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
            onClick={openDrawer}
          >
            <Icon name="menu" />
            <span className="sr-only">Open menu</span>
          </button>
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <BrandMark className="h-8 w-8 text-sm" />
            MoneyMap
          </Link>
        </header>
        <div className="pb-28">{children}</div>
      </div>
      <AssistantWidget />
    </div>
  )
}
