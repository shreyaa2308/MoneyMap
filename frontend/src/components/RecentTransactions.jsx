import { Link } from 'react-router-dom'
import { formatCents } from '../money'

export default function RecentTransactions({ transactions }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-slate-500">No transactions in this month.</p>
  }

  return (
    <div>
      <ul className="divide-y divide-slate-200">
        {transactions.map((transaction) => (
          <li key={transaction.id} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="font-medium">{transaction.description}</p>
              <p className="text-sm text-slate-500">
                {transaction.occurred_on} · {transaction.category_name || 'Uncategorized'}
              </p>
            </div>
            <p className={transaction.amount_cents < 0 ? 'font-medium text-rose-700' : 'font-medium text-teal-800'}>
              {formatCents(transaction.amount_cents)}
            </p>
          </li>
        ))}
      </ul>
      <Link to="/transactions" className="mt-2 inline-block text-sm text-teal-800">
        All transactions
      </Link>
    </div>
  )
}
