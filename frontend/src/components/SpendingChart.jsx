import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCents } from '../money'

function formatAxis(cents) {
  return `$${Math.round(cents / 100)}`
}

export default function SpendingChart({ spending }) {
  if (spending.length === 0) {
    return <p className="text-sm text-faint">No expenses in this month.</p>
  }

  const rows = spending.map((item) => ({
    name: item.category_name,
    spent: item.spent_cents,
  }))

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatAxis} width={56} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCents(-Number(value))} />
          <Bar dataKey="spent" name="Spent" fill="#0e1a2b" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
