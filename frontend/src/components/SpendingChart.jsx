import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCents } from '../money'

const CATEGORY_COLORS = ['#d9f2c2', '#9ddeb4', '#5eae86', '#c9b7ef', '#e7d7a1', '#8fd0c4', '#f0c2d0', '#7aa2c4']

function shareLabel(part, whole) {
  if (whole <= 0) {
    return '0%'
  }
  const share = Math.round((part * 100) / whole)
  return share === 0 ? '<1%' : `${share}%`
}

function SpendingTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null
  }
  const row = payload[0].payload
  return (
    <div className="chart-tooltip">
      <p className="text-sm font-semibold">{row.name}</p>
      <p className="money mt-1 text-sm text-negative">{formatCents(-row.spent)}</p>
      <p className="mt-1 text-xs text-faint">{row.shareLabel} of expenses</p>
    </div>
  )
}

export default function SpendingChart({ spending, onSelectCategory }) {
  if (spending.length === 0) {
    return <p className="empty">No expenses in this month.</p>
  }

  const total = spending.reduce((sum, item) => sum + item.spent_cents, 0)
  const rows = spending.map((item, index) => ({
    name: item.category_name,
    spent: item.spent_cents,
    categoryId: item.category_id,
    shareLabel: shareLabel(item.spent_cents, total),
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
  }))

  function openRow(row) {
    if (row?.categoryId != null && onSelectCategory) {
      onSelectCategory(row.categoryId)
    }
  }

  return (
    <div className="spending-chart">
      <div className="relative h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<SpendingTooltip />} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
            <Pie
              data={rows}
              dataKey="spent"
              nameKey="name"
              innerRadius={68}
              outerRadius={96}
              paddingAngle={4}
              cornerRadius={10}
              stroke="transparent"
              onClick={(_, index) => openRow(rows[index])}
            >
              {rows.map((row) => (
                <Cell key={row.categoryId} fill={row.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="money text-2xl font-semibold">{formatCents(-total)}</p>
            <p className="mt-1 text-[0.68rem] font-semibold tracking-[0.16em] text-faint uppercase">Spent</p>
          </div>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((row) => (
          <li key={row.categoryId}>
            <Link
              to={`/transactions?category_id=${row.categoryId}`}
              className="group flex items-center justify-between gap-3 rounded-2xl px-3 py-2 transition hover:bg-white/5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden="true" />
                <span className="truncate font-medium group-hover:text-pine-deep">{row.name}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="money block text-sm font-semibold">{formatCents(-row.spent)}</span>
                <span className="text-xs text-faint">{row.shareLabel}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
