# MoneyMap presentation checklist

## Before you start

1. From `backend`, activate `.venv` and start the API:

```bash
cd ~/Projects/MoneyMap/backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

2. In a second terminal, start the website:

```bash
cd ~/Projects/MoneyMap/frontend
npm run dev
```

3. Open http://127.0.0.1:5173. The home page should say the backend is connected.
4. Optional AI check, from `backend` with the virtual environment active:

```bash
python scripts/check_ai.py
```

That script sends one short prompt and no financial records. Skip it if you want to avoid using API credit.

## Demo flow

1. Log in as `demo@moneymap.example` / `demopassword`. Say that this login and its records are fictional.
2. Open Dashboard for October 2026. Point out income, expenses, net cash flow, the category chart, budget progress, and the six-month comparison.
3. Open Transactions. Add a small expense, show it in the list, then edit or delete it.
4. Open Accounts. Cash balances come from transactions. Net worth adds simulated holdings once. There are no loan or credit-card accounts.
5. Open Investments and say the prices are typed in. MoneyMap does not look up a market.
6. Open Bills. A bill is a schedule. Marking it paid creates one expense and moves the next due date. It does not charge a bank.
7. On Transactions, download the sample bank statement CSV, choose Everyday Checking plus Groceries and Pay, preview it, then import the valid rows. The preview shows one duplicate and two invalid rows. Those rows are not saved.
8. Open Assistant and ask one or two questions from the list below.

## Sample assistant questions

- Summarize my spending this month.
- Which categories account for most of my expenses?
- How am I doing against my budgets?
- Compare this month with last month.
- What recurring bills are coming up?
- Give me three practical ways to reduce my discretionary spending.

## If the assistant is unavailable

Keep going. Dashboard, transactions, accounts, investments, bills, and CSV import do not need an API key.

If the Assistant page says the key is missing, `backend/.env` needs `OPENAI_API_KEY`, then restart the backend. If it says the model is unavailable, set `OPENAI_MODEL` to a model your API account can use. If it says credit is exhausted, stop calling the assistant and continue the rest of the demo.

The assistant only explains saved records. It cannot add or change them, and it is not financial, tax, or investment advice.
