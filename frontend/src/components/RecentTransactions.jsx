import { Link } from 'react-router-dom'
import { formatCents } from '../money'

export default function RecentTransactions({ transactions }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-faint">No transactions in this month.</p>
  }

  return (
    <div>
      <ul className="divide-y divide-slate-200">
        {transactions.map((transaction) => (
          <li key={transaction.id} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{transaction.description}</p>
              <p className="text-sm text-faint">
                {transaction.occurred_on} · {transaction.category_name || 'Uncategorized'}
              </p>
            </div>
            <p className={transaction.amount_cents < 0 ? 'money font-semibold text-negative' : 'money font-semibold text-pine'}>
              {formatCents(transaction.amount_cents)}
            </p>
          </li>
        ))}
      </ul>
      <Link to="/transactions" className="mt-2 inline-block text-sm text-pine">
        All transactions
      </Link>
    </div>
  )
}
