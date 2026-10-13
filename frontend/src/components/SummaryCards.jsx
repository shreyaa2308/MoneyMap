import { formatCents } from '../money'

function Card({ label, value, tone, featured }) {
  const toneClass = tone === 'expense' ? 'text-negative' : 'text-pine'
  return (
    <section className={featured ? 'card bg-navy text-white' : 'card'}>
      <p className={featured ? 'text-sm text-white/70' : 'text-sm text-faint'}>{label}</p>
      <p className={`money mt-3 text-3xl font-semibold ${featured ? 'text-white' : toneClass}`}>{value}</p>
    </section>
  )
}

export default function SummaryCards({ incomeCents, expenseCents, netCents }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card label="Income" value={formatCents(incomeCents)} tone="income" />
      <Card label="Expenses" value={formatCents(-expenseCents)} tone="expense" />
      <Card label="Net cash flow" value={formatCents(netCents)} tone={netCents < 0 ? 'expense' : 'income'} featured />
    </div>
  )
}
