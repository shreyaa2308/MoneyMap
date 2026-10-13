import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.js'

const linkClass = ({ isActive }) =>
  isActive
    ? 'rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-navy'
    : 'rounded-full px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white'

export default function AppShell({ children }) {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function onLogout() {
    setMenuOpen(false)
    logout()
    navigate('/login')
  }

  const links = token
    ? [
        ['/dashboard', 'Dashboard'],
        ['/transactions', 'Transactions'],
        ['/accounts', 'Accounts'],
        ['/investments', 'Investments'],
        ['/bills', 'Bills'],
        ['/assistant', 'Assistant'],
      ]
    : [
        ['/login', 'Log in'],
        ['/register', 'Register'],
      ]

  function closeMenu() {
    setMenuOpen(false)
  }

  const navItems = (
    <>
      {links.map(([to, label]) => (
        <NavLink key={to} to={to} className={linkClass} onClick={closeMenu}>
          {label}
        </NavLink>
      ))}
      {token ? (
        <button type="button" onClick={onLogout} className="rounded-full px-3 py-1.5 text-left text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">
          Log out
        </button>
      ) : null}
    </>
  )

  return (
    <div className="min-h-screen text-ink">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" onClick={closeMenu}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-pine text-sm font-semibold text-white">M</span>
            <span className="text-lg font-semibold tracking-tight">MoneyMap</span>
          </Link>
          <nav className="hidden flex-wrap items-center gap-1 lg:flex">{navItems}</nav>
          <button
            type="button"
            className="rounded-full border border-white/20 px-3 py-1.5 text-sm font-medium lg:hidden"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
        </div>
        {menuOpen ? (
          <nav className="flex flex-col gap-1 border-t border-white/10 px-4 py-3 text-sm lg:hidden">{navItems}</nav>
        ) : null}
      </header>
      {children}
    </div>
  )
}
