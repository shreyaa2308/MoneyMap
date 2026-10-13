import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth.js'
import BudgetList from '../components/BudgetList.jsx'
import CashFlowChart from '../components/CashFlowChart.jsx'
import RecentTransactions from '../components/RecentTransactions.jsx'
import SpendingChart from '../components/SpendingChart.jsx'
import SummaryCards from '../components/SummaryCards.jsx'
import { currentMonth, formatMonthLabel, shiftMonth } from '../money'

export default function DashboardPage() {
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const [month, setMonth] = useState(currentMonth)
  const [dashboard, setDashboard] = useState(null)
  const [categories, setCategories] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

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
        const [summary, categoryRows] = await Promise.all([
          api(`/api/dashboard?month=${month}`),
          api('/api/categories'),
        ])
        if (ignore) {
          return
        }
        setDashboard(summary)
        setCategories(categoryRows)
        setError('')
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
  }, [token, month, reloadKey, logout, navigate])

  function changeMonth(next) {
    if (!next) {
      return
    }
    setLoading(true)
    setMonth(next)
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-slate-600">{formatMonthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeMonth(shiftMonth(month, -1))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            Previous
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => changeMonth(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2"
          />
          <button
            type="button"
            onClick={() => changeMonth(shiftMonth(month, 1))}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            Next
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      {loading || !dashboard ? (
        <p className="mt-6 text-slate-500">Loading dashboard…</p>
      ) : (
        <div className="mt-6 space-y-6">
          <SummaryCards
            incomeCents={dashboard.total_income_cents}
            expenseCents={dashboard.total_expenses_cents}
            netCents={dashboard.net_cents}
          />

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Spending by category</h2>
            <div className="mt-4">
              <SpendingChart spending={dashboard.spending_by_category} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Income and expenses</h2>
            <p className="mt-1 text-sm text-slate-500">The selected month and the five months before it.</p>
            <div className="mt-4">
              <CashFlowChart months={dashboard.monthly_comparison} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Budgets</h2>
            <p className="mt-1 text-sm text-slate-500">
              A budget is a spending limit. It is not counted as money spent.
            </p>
            <div className="mt-4">
              <BudgetList
                budgets={dashboard.budgets}
                month={month}
                categories={categories}
                onChange={() => setReloadKey((value) => value + 1)}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-lg font-semibold">Recent transactions</h2>
            <div className="mt-2">
              <RecentTransactions transactions={dashboard.recent_transactions} />
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
