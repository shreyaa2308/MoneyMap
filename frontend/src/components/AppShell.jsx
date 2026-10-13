import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.js'

export default function AppShell({ children }) {
  const { token, logout } = useAuth()
  const navigate = useNavigate()

  function onLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link to="/" className="text-lg font-semibold">
            MoneyMap
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            {token ? (
              <>
                <Link to="/dashboard" className="text-slate-700">
                  Dashboard
                </Link>
                <Link to="/transactions" className="text-slate-700">
                  Transactions
                </Link>
                <Link to="/accounts" className="text-slate-700">
                  Accounts
                </Link>
                <Link to="/investments" className="text-slate-700">
                  Investments
                </Link>
                <Link to="/bills" className="text-slate-700">
                  Bills
                </Link>
                <button type="button" onClick={onLogout} className="text-slate-700">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-slate-700">
                  Log in
                </Link>
                <Link to="/register" className="text-slate-700">
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      {children}
    </div>
  )
}
