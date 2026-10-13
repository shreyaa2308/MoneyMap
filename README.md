# MoneyMap

MoneyMap is a local personal finance app. The website talks to the API through a local proxy, and the API stores each user's accounts, transactions, budgets, bills, and manual investments in SQLite. It does not connect to banks or live markets, and it is not a production deployment.

## Requirements

- Python 3.12 or newer. This project uses the virtual environment in `backend/.venv`, which was created with Python 3.14.
- The system `python3` on macOS may still be an older version. Use the virtual environment below so the app does not pick that one up.
- Node.js and npm, for the website. This machine has Node 24.

## Run the backend

From the project folder:

```bash
cd ~/Projects/MoneyMap/backend
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Leave that terminal open. The `--reload` flag restarts the server when you change Python files.

## Check the health endpoint

In a second terminal:

```bash
curl http://127.0.0.1:8000/api/health
```

You should see:

```json
{"status":"ok","database":"ok"}
```

Open http://127.0.0.1:8000/docs to see the same route in the FastAPI documentation page.

Starting the backend also creates `backend/moneymap.db` if that file is missing, and creates any tables that are not there yet. New tables (`budgets`, `holdings`, `bills`, `bill_payments`) are added beside existing rows. Startup does not delete or rewrite users, accounts, categories, transactions, or budgets. It does not add columns to tables that already exist. The database file is local and is not committed.

Optional environment variables:

- `MONEYMAP_JWT_SECRET` — signing key for login tokens. If it is unset, the app uses a local development default that must not be used on a public server.
- `MONEYMAP_SKIP_SEED=1` — skip the fictional demo user. The tests set this themselves.

Amounts are stored as integer cents. Income is a positive amount and an expense is a negative amount. The dashboard adds positive amounts for income and the absolute value of negative amounts for expenses. There is no transfer type yet, so every saved amount is included. A budget limit is not spending.

## Run the frontend

In another terminal:

```bash
cd ~/Projects/MoneyMap/frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. You should see the MoneyMap page and the line `Backend: connected, database ok`.

Register an account, or log in with the fictional sample user:

- Email: `demo@moneymap.example`
- Password: `demopassword`

That login only exists for local sample data. It is not a real bank account. The sample transactions are created once, the first time the backend starts and that email is missing. October 2026 spending limits, one simulated holding (Northwind Index Fund), and one bill (City Stream Monthly) are added if those names are missing. Restarting the backend does not delete your other users or change records you already edited.

After you log in:

- Dashboard shows the selected month: income, expenses, net cash flow, spending by category, budget progress, and recent transactions.
- Accounts lists checking, savings, and cash accounts, their balances, and net worth.
- Investments stores quantities and prices you type in. Prices are not live.
- Bills tracks upcoming and overdue items. Mark paid creates one expense and moves the next due date. It does not charge anyone.
- Transactions can import a CSV after a preview.

A budget is a spending limit. It is not itself a transaction. Net worth is the sum of account balances plus each holding's current value. Holdings are not copied into an account, so they are not counted twice.

Routes that require a login token:

- `GET /api/accounts`, `POST /api/accounts`, `PUT /api/accounts/{account_id}`, `DELETE /api/accounts/{account_id}`
- `GET /api/net-worth`
- `GET /api/holdings`, `POST /api/holdings`, `PUT /api/holdings/{holding_id}`, `DELETE /api/holdings/{holding_id}`
- `GET /api/bills`, `POST /api/bills`, `PUT /api/bills/{bill_id}`, `DELETE /api/bills/{bill_id}`, `POST /api/bills/{bill_id}/pay`, `GET /api/bills/payments`
- `POST /api/imports/preview`, `POST /api/imports`
- `GET /api/budgets?month=YYYY-MM`, `POST /api/budgets`, `PUT /api/budgets/{budget_id}`, `DELETE /api/budgets/{budget_id}`
- `GET /api/dashboard?month=YYYY-MM`

Deleting an account that still has transactions returns a conflict. You can move those transactions to another account with `?reassign_to={account_id}`, or remove them with `?confirm=delete-transactions`.

## Import a CSV

On Transactions, choose a `.csv` file of at most 1 MB and 500 data rows. Preview it, then import the valid rows. The server reads the upload in memory and does not save the file.

```csv
date,description,amount,type,category,account
2026-10-03,Harbor Market,12.50,expense,Groceries,Cash
2026-10-04,Payroll,100.00,income,Pay,Cash
```

`amount` is a positive number of dollars. `type` is `income` or `expense`. `category` and `account` must already exist for the signed-in user. A row that matches an existing transaction, or an earlier row in the same file, on date, description, amount, category, and account is skipped as a duplicate. Invalid rows are reported and are not saved.

## Build the frontend

From the frontend folder:

```bash
npm run lint
npm run build
```

The page asks its own server for `/api/health`. Vite forwards any path that starts with `/api` to FastAPI on port 8000. The browser does not call port 8000 directly.

Check that forward from a terminal:

```bash
curl http://127.0.0.1:5173/api/health
```

The JSON should match the backend health check. Both servers must be running.

## Check the database

From the backend folder, with the virtual environment active:

```bash
python -m pytest
```

The tests should pass. They use a temporary database, so they do not delete `backend/moneymap.db`. They cover registration, login, transactions, budgets, dashboard totals, accounts, net worth, holdings, bills, CSV import, and the rule that one user cannot read another user's records.

## Limitations

- Investments are manual. There is no live price feed and no brokerage connection.
- There is no bank connection and no place to enter bank credentials.
- Marking a bill paid writes a normal expense. It does not send money anywhere.
- There is no transfer type. Every saved transaction counts as income or an expense by its sign.
- This app is for local use. Do not put the development token secret on a public server.

The `sqlite3` command line does not turn on foreign keys by itself. This app turns them on for each connection it opens. To see that setting through the app:

```bash
python -c "from app.database import SessionLocal; from sqlalchemy import text; db = SessionLocal(); print(db.execute(text('PRAGMA foreign_keys')).scalar()); db.close()"
```

The printed value should be `1`.
