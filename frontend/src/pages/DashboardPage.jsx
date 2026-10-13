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
    <main className="page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-1 text-muted">{formatMonthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeMonth(shiftMonth(month, -1))}
            className="btn btn-secondary"
          >
            Previous
          </button>
          <input
            type="month"
            value={month}
            onChange={(event) => changeMonth(event.target.value)}
            className="field field-inline"
          />
          <button
            type="button"
            onClick={() => changeMonth(shiftMonth(month, 1))}
            className="btn btn-secondary"
          >
            Next
          </button>
        </div>
      </div>

      {loading ? <p className="mt-6 text-faint">Loading dashboard…</p> : null}
      {!loading && error ? <p className="alert-error mt-4">{error}</p> : null}
      {!loading && !dashboard && !error ? (
        <p className="mt-6 text-faint">No dashboard data for this month.</p>
      ) : null}
      {!loading && dashboard ? (
        <div className="mt-6 space-y-6">
          <SummaryCards
            incomeCents={dashboard.total_income_cents}
            expenseCents={dashboard.total_expenses_cents}
            netCents={dashboard.net_cents}
          />

          <section className="card">
            <h2 className="text-lg font-semibold">Spending by category</h2>
            <div className="mt-4">
              <SpendingChart spending={dashboard.spending_by_category} />
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold">Income and expenses</h2>
            <p className="mt-1 text-sm text-faint">The selected month and the five months before it.</p>
            <div className="mt-4">
              <CashFlowChart months={dashboard.monthly_comparison} />
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold">Budgets</h2>
            <p className="mt-1 text-sm text-faint">
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

          <section className="card">
            <h2 className="text-lg font-semibold">Recent transactions</h2>
            <div className="mt-2">
              <RecentTransactions transactions={dashboard.recent_transactions} />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
