import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import AiBrief from '../components/AiBrief.jsx'
import BudgetList from '../components/BudgetList.jsx'
import CashFlowChart from '../components/CashFlowChart.jsx'
import DashboardInsights from '../components/DashboardInsights.jsx'
import RecentTransactions from '../components/RecentTransactions.jsx'
import SpendingChart from '../components/SpendingChart.jsx'
import SummaryCards from '../components/SummaryCards.jsx'
import { friendlyName, useAuth } from '../auth.js'
import { currentMonth, formatCents, formatMonthLabel, shiftMonth } from '../money'

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5V3.5M5.5 6 8 3.5 10.5 6" />
      <path strokeLinecap="round" d="M3.5 12.5h9" />
    </svg>
  )
}

export default function DashboardPage() {
  const { token, email, logout } = useAuth()
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

  function openCategory(categoryId) {
    navigate(`/transactions?category_id=${categoryId}`)
  }

  const expenseCount = dashboard?.spending_by_category.length ?? 0
  const name = friendlyName(email)

  return (
    <main className="page">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {name ? `Hello, ${name}` : 'Hello'}
          </h1>
          <p className="mt-2 text-base text-muted">Cash flow, budgets, and bills for {formatMonthLabel(month)}.</p>
        </div>
        <div className="flex flex-col gap-3 sm:items-start lg:items-end">
          <div className="flex flex-wrap gap-2">
            <Link to="/transactions#add-transaction" className="btn btn-primary gap-2 px-5 tracking-wide uppercase">
              <PlusIcon />
              Add transaction
            </Link>
            <Link to="/transactions#csv-import" className="btn btn-secondary gap-2">
              <UploadIcon />
              Import CSV
            </Link>
          </div>
          <div className="segmented">
            <button type="button" onClick={() => changeMonth(shiftMonth(month, -1))} className="btn btn-secondary">
              Previous
            </button>
            <input
              type="month"
              value={month}
              aria-label="Month"
              onChange={(event) => changeMonth(event.target.value)}
              className="field field-inline"
            />
            <button type="button" onClick={() => changeMonth(shiftMonth(month, 1))} className="btn btn-secondary">
              Next
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 space-y-4" role="status">
          <p className="text-faint">Loading dashboard…</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="skeleton h-36" />
            <div className="skeleton h-36" />
            <div className="skeleton h-36" />
            <div className="skeleton h-36" />
          </div>
          <div className="grid gap-4 xl:grid-cols-12">
            <div className="skeleton h-80 xl:col-span-8" />
            <div className="skeleton h-80 xl:col-span-4" />
          </div>
        </div>
      ) : null}
      {!loading && error ? <p className="alert-error mt-4" role="alert">{error}</p> : null}
      {!loading && !dashboard && !error ? <p className="empty-panel mt-6">No dashboard data for this month.</p> : null}
      {!loading && dashboard ? (
        <div className="mt-8 space-y-5">
          <SummaryCards
            incomeCents={dashboard.total_income_cents}
            expenseCents={dashboard.total_expenses_cents}
            netCents={dashboard.net_cents}
            months={dashboard.monthly_comparison}
            budgets={dashboard.budgets}
          />

          <div className="grid items-stretch gap-5 xl:grid-cols-12">
            <section className="card card-raised min-w-0 xl:col-span-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="section-kicker">Cash flow</p>
                  <h2 className="mt-3 text-xl font-semibold">Income and expenses</h2>
                  <p className="mt-1 text-sm text-faint">The selected month and the five months before it.</p>
                </div>
                <p className="money text-3xl font-semibold">{formatCents(dashboard.net_cents)}</p>
              </div>
              <div className="mt-4">
                <CashFlowChart months={dashboard.monthly_comparison} />
              </div>
            </section>
            <div className="h-full xl:col-span-4">
              <AiBrief />
            </div>
          </div>

          <DashboardInsights dashboard={dashboard} />

          <div className="grid items-start gap-5 xl:grid-cols-3">
            <section className="card card-raised min-w-0">
              <p className="section-kicker">Spending</p>
              <h2 className="mt-3 text-xl font-semibold">By category</h2>
              <p className="mt-1 text-sm text-faint">
                {expenseCount > 0
                  ? `${formatMonthLabel(month)} expenses. Select a category to see its transactions.`
                  : 'Expenses recorded in the selected month.'}
              </p>
              <div className="mt-4">
                <SpendingChart spending={dashboard.spending_by_category} onSelectCategory={openCategory} />
              </div>
            </section>
            <section className="card card-raised">
              <p className="section-kicker">Plans</p>
              <h2 className="mt-3 text-xl font-semibold">Budgets</h2>
              <p className="mt-1 text-sm text-faint">A budget is a spending limit. It is not counted as money spent.</p>
              <div className="mt-4">
                <BudgetList
                  budgets={dashboard.budgets}
                  month={month}
                  categories={categories}
                  onChange={() => setReloadKey((value) => value + 1)}
                />
              </div>
            </section>
            <section className="card card-raised">
              <p className="section-kicker">Activity</p>
              <h2 className="mt-3 text-xl font-semibold">Recent transactions</h2>
              <div className="mt-2">
                <RecentTransactions transactions={dashboard.recent_transactions} />
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </main>
  )
}
