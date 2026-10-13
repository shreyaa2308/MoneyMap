import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCents } from '../money'

function formatAxis(cents) {
  return `$${Math.round(cents / 100)}`
}

export default function CashFlowChart({ months }) {
  const hasActivity = months.some((month) => month.income_cents > 0 || month.expenses_cents > 0)
  if (!hasActivity) {
    return <p className="text-sm text-faint">No income or expenses in this six-month window.</p>
  }

  const rows = months.map((month) => ({
    month: month.month.slice(5),
    Income: month.income_cents,
    Expenses: month.expenses_cents,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatAxis} width={56} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCents(Number(value))} />
          <Bar dataKey="Income" fill="#1c7c4a" radius={[8, 8, 0, 0]} />
          <Bar dataKey="Expenses" fill="#9d2c2c" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
