import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCents, formatMonthLabel } from '../money'

const AXIS = '#96a2ad'
const GRID = 'rgba(255,255,255,0.06)'
const INCOME = '#d4f0b8'
const EXPENSE = '#e7a8b8'

function formatAxis(cents) {
  return `$${Math.round(cents / 100)}`
}

function shortMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleString(undefined, { month: 'short' })
}

function CashTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null
  }
  const row = payload[0].payload
  return (
    <div className="chart-tooltip">
      <p className="text-sm font-semibold">{row.label}</p>
      <p className="money mt-2 text-sm text-pine">Income {formatCents(row.Income)}</p>
      <p className="money text-sm text-negative">Expenses {formatCents(-row.Expenses)}</p>
      <p className="money mt-2 border-t border-line pt-2 text-sm font-semibold">Net {formatCents(row.net)}</p>
    </div>
  )
}

export default function CashFlowChart({ months }) {
  const hasActivity = months.some((month) => month.income_cents > 0 || month.expenses_cents > 0)
  if (!hasActivity) {
    return <p className="empty">No income or expenses in this six-month window.</p>
  }

  const rows = months.map((month) => ({
    axis: shortMonth(month.month),
    label: formatMonthLabel(month.month),
    Income: month.income_cents,
    Expenses: month.expenses_cents,
    net: month.income_cents - month.expenses_cents,
  }))

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6} barCategoryGap="32%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="axis" tick={{ fontSize: 12, fill: AXIS }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={formatAxis}
              width={56}
              tick={{ fontSize: 12, fill: AXIS }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CashTooltip />}
              cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
              wrapperStyle={{ outline: 'none', zIndex: 5 }}
            />
            <Bar dataKey="Income" fill={INCOME} radius={[12, 12, 12, 12]} maxBarSize={22} activeBar={{ fill: '#e7f8c8' }} />
            <Bar dataKey="Expenses" fill={EXPENSE} radius={[12, 12, 12, 12]} maxBarSize={22} activeBar={{ fill: '#f3c3ce' }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="legend-pill">
          <span className="legend-swatch" style={{ background: INCOME }} />
          Income
        </span>
        <span className="legend-pill">
          <span className="legend-swatch" style={{ background: EXPENSE }} />
          Expenses
        </span>
      </div>
    </div>
  )
}
