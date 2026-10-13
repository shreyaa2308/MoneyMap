import { Link } from 'react-router-dom'
import { formatCents, formatMonthLabel } from '../money'

function shareLabel(part, whole) {
  if (whole <= 0) {
    return '0%'
  }
  const share = Math.round((part * 100) / whole)
  if (share === 0) {
    return '<1%'
  }
  return `${share}%`
}

function buildInsights(dashboard) {
  const spending = dashboard.spending_by_category
  const spent = spending.reduce((sum, item) => sum + item.spent_cents, 0)
  const top = spending[0]
  const months = dashboard.monthly_comparison
  const current = months.length > 0 ? months[months.length - 1] : null
  const previous = months.length > 1 ? months[months.length - 2] : null
  const over = dashboard.budgets.filter((budget) => budget.status === 'over')
  const approaching = dashboard.budgets.filter((budget) => budget.status === 'approaching')

  const largest = top
    ? {
        label: 'Largest category',
        title: top.category_name,
        detail: `${formatCents(-top.spent_cents)} · ${shareLabel(top.spent_cents, spent)} of expenses`,
        tone: 'negative',
        categoryId: top.category_id,
      }
    : {
        label: 'Largest category',
        title: 'No expenses',
        detail: 'No category spending was recorded this month.',
        tone: 'neutral',
      }

  let compared
  if (current && previous) {
    const currentNet = current.income_cents - current.expenses_cents
    const previousNet = previous.income_cents - previous.expenses_cents
    const delta = currentNet - previousNet
    const direction = delta === 0 ? 'Unchanged from' : delta > 0 ? `Up ${formatCents(delta)} from` : `Down ${formatCents(Math.abs(delta))} from`
    compared = {
      label: 'Versus last month',
      title: formatCents(currentNet),
      detail: `${direction} ${formatMonthLabel(previous.month)} (${formatCents(previousNet)}).`,
      tone: currentNet < 0 ? 'negative' : currentNet > 0 ? 'positive' : 'neutral',
    }
  } else {
    compared = {
      label: 'Versus last month',
      title: current ? formatCents(current.income_cents - current.expenses_cents) : 'No comparison',
      detail: 'Earlier months are not in this dashboard response.',
      tone: 'neutral',
    }
  }

  let budget
  if (dashboard.budgets.length === 0) {
    budget = {
      label: 'Budgets',
      title: 'None set',
      detail: 'No spending limits are saved for this month.',
      tone: 'neutral',
    }
  } else if (over.length > 0) {
    budget = {
      label: 'Budgets',
      title: over.length === 1 ? '1 over limit' : `${over.length} over limit`,
      detail: over.map((item) => item.category_name).join(', '),
      tone: 'negative',
    }
  } else if (approaching.length > 0) {
    budget = {
      label: 'Budgets',
      title: approaching.length === 1 ? '1 nearing limit' : `${approaching.length} nearing limit`,
      detail: approaching.map((item) => item.category_name).join(', '),
      tone: 'warning',
    }
  } else {
    budget = {
      label: 'Budgets',
      title: 'Within limits',
      detail:
        dashboard.budgets.length === 1
          ? 'The saved budget is within its limit.'
          : `All ${dashboard.budgets.length} saved budgets are within their limits.`,
      tone: 'positive',
    }
  }

  const kept =
    dashboard.total_income_cents > 0
      ? {
          label: 'After expenses',
          title: `${Math.round((dashboard.net_cents * 100) / dashboard.total_income_cents)}%`,
          detail: `${formatCents(dashboard.net_cents)} net from ${formatCents(dashboard.total_income_cents)} income.`,
          tone: dashboard.net_cents < 0 ? 'negative' : 'positive',
        }
      : {
          label: 'After expenses',
          title: 'No income',
          detail: 'No income was recorded this month.',
          tone: 'neutral',
        }

  return [largest, compared, budget, kept]
}

const toneDot = {
  positive: 'bg-pine',
  negative: 'bg-negative',
  warning: 'bg-amber-500',
  neutral: 'bg-white/30',
}

export default function DashboardInsights({ dashboard }) {
  const insights = buildInsights(dashboard)
  return (
    <section aria-label="Insights">
      <div className="mb-4">
        <p className="section-kicker">This month</p>
        <h2 className="mt-2 text-xl font-semibold">Insights</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {insights.map((insight) => (
          <article key={insight.label} className="card card-raised card-hover h-full p-5">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-faint uppercase">
              <span className={`h-2 w-2 rounded-full ${toneDot[insight.tone]}`} aria-hidden="true" />
              {insight.label}
            </p>
            <p className="money mt-3 text-2xl font-semibold tracking-tight">{insight.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{insight.detail}</p>
            {insight.categoryId ? (
              <Link
                to={`/transactions?category_id=${insight.categoryId}`}
                className="mt-3 inline-block text-sm font-semibold text-pine-deep hover:underline"
              >
                View {insight.title} transactions
              </Link>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
