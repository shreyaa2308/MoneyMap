import { Icon } from '../icons.jsx'
import { formatCents } from '../money'

function percentChange(current, previous) {
  if (previous == null || previous === 0) {
    return null
  }
  const value = ((current - previous) / Math.abs(previous)) * 100
  if (!Number.isFinite(value)) {
    return null
  }
  return Math.round(value * 10) / 10
}

function DeltaPill({ value, invert = false }) {
  if (value == null) {
    return null
  }
  if (value === 0) {
    return <span className="pill">0%</span>
  }
  const positive = value > 0
  const favorable = invert ? !positive : positive
  const label = `${positive ? '+' : ''}${value}%`
  return <span className={favorable ? 'pill pill-up' : 'pill pill-down'}>{label}</span>
}

function Card({ icon, label, value, caption, delta, invert, tone }) {
  const valueClass = tone === 'expense' ? 'text-negative' : tone === 'income' ? 'text-pine' : 'text-ink'
  return (
    <section className="card card-raised card-hover flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5 text-pine" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        <DeltaPill value={delta} invert={invert} />
      </div>
      <p className="mt-4 text-xs font-semibold tracking-[0.14em] text-faint uppercase">{label}</p>
      <p className={`money mt-2 text-3xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
      <p className="mt-2 text-sm text-muted">{caption}</p>
    </section>
  )
}

export default function SummaryCards({ incomeCents, expenseCents, netCents, months = [], budgets = [] }) {
  const previous = months.length > 1 ? months[months.length - 2] : null
  const expenseShare = incomeCents > 0 ? Math.round((expenseCents * 100) / incomeCents) : null
  const over = budgets.filter((budget) => budget.status === 'over').length
  const budgetCaption =
    budgets.length === 0 ? 'No spending limits this month' : over > 0 ? `${over} over limit` : 'Within the saved limits'

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        icon="investments"
        label="Income"
        value={formatCents(incomeCents)}
        tone="income"
        delta={previous ? percentChange(incomeCents, previous.income_cents) : null}
        caption="Positive amounts this month"
      />
      <Card
        icon="transactions"
        label="Expenses"
        value={formatCents(-expenseCents)}
        tone="expense"
        invert
        delta={previous ? percentChange(expenseCents, previous.expenses_cents) : null}
        caption={expenseShare == null ? 'Negative amounts this month' : `${expenseShare}% of income`}
      />
      <Card
        icon="dashboard"
        label="Net cash flow"
        value={formatCents(netCents)}
        tone={netCents < 0 ? 'expense' : 'income'}
        delta={
          previous
            ? percentChange(netCents, previous.income_cents - previous.expenses_cents)
            : null
        }
        caption="Income minus expenses"
      />
      <Card
        icon="bills"
        label="Budgets"
        value={String(budgets.length)}
        tone="neutral"
        caption={budgetCaption}
      />
    </div>
  )
}
