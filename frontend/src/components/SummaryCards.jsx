import { formatCents } from '../money'

function Card({ label, value, tone }) {
  const toneClass = tone === 'expense' ? 'text-rose-700' : tone === 'income' ? 'text-teal-800' : 'text-slate-900'
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </section>
  )
}

export default function SummaryCards({ incomeCents, expenseCents, netCents }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card label="Income" value={formatCents(incomeCents)} tone="income" />
      <Card label="Expenses" value={formatCents(-expenseCents)} tone="expense" />
      <Card label="Net" value={formatCents(netCents)} tone={netCents < 0 ? 'expense' : 'income'} />
    </div>
  )
}
