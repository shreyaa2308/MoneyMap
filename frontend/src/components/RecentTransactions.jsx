import { Link } from 'react-router-dom'
import { formatCents } from '../money'

export default function RecentTransactions({ transactions }) {
  if (transactions.length === 0) {
    return <p className="empty">No transactions in this month.</p>
  }

  return (
    <div>
      <ul className="divide-y divide-line">
        {transactions.map((transaction) => (
          <li key={transaction.id} className="flex items-start justify-between gap-3 rounded-2xl px-2 py-3 transition hover:bg-white/5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine/15 text-xs font-semibold text-pine" aria-hidden="true">
                {(transaction.category_name || '?').slice(0, 1)}
              </span>
              <div className="min-w-0">
              <p className="truncate font-medium">{transaction.description}</p>
              <p className="text-sm text-faint">
                {transaction.occurred_on}
                {' · '}
                {transaction.category_id ? (
                  <Link to={`/transactions?category_id=${transaction.category_id}`} className="font-medium text-pine-deep hover:underline">
                    {transaction.category_name || 'Uncategorized'}
                  </Link>
                ) : (
                  transaction.category_name || 'Uncategorized'
                )}
              </p>
              </div>
            </div>
            <p className={transaction.amount_cents < 0 ? 'money shrink-0 font-semibold text-negative' : 'money shrink-0 font-semibold text-pine'}>
              {formatCents(transaction.amount_cents)}
            </p>
          </li>
        ))}
      </ul>
      <Link to="/transactions" className="mt-3 inline-block text-sm font-semibold text-pine-deep hover:underline">
        All transactions
      </Link>
    </div>
  )
}
