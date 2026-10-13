# MoneyMap

MoneyMap is a local personal finance app. The website talks to the API through a local proxy, and the API stores each user's accounts, transactions, budgets, bills, and manual investments in SQLite. A read-only assistant can explain those saved records. The app does not connect to banks or live markets, and it is not a production deployment.

## Features

- Registration, login, and logout. Each user sees only their own records.
- Transactions with search and filters, plus account balances that follow those transactions.
- Monthly budgets, a dashboard, and a six-month income-versus-expense chart.
- Checking, savings, and cash accounts, and a net-worth total.
- Simulated investment holdings with prices you type in.
- Scheduled bills. Marking one paid creates a single expense.
- CSV preview and import.
- An optional assistant that explains calculated totals. It cannot change records.

## Layout

```text
backend/app/          FastAPI application, models, and routers
backend/tests/        pytest suite, using a temporary database
backend/scripts/      optional OpenAI connectivity check
frontend/src/         React pages and components
backend/moneymap.db   local SQLite file, created on startup, not committed
```

## Requirements

- Python 3.12 or newer. This project uses the virtual environment in `backend/.venv`, which was created with Python 3.14. The system `python3` on macOS may be older, so use the virtual environment.
- Node.js 20 or newer and npm. This machine has Node 24.

## Environment

Copy the example and edit the copy:

```bash
cp backend/.env.example backend/.env
```

`backend/.env` is ignored by Git. The example file has placeholders only.

| Variable | Purpose |
| --- | --- |
| `MONEYMAP_ENV` | `development` is the local default. Any other value requires `MONEYMAP_JWT_SECRET`. |
| `MONEYMAP_JWT_SECRET` | Signing key for login tokens. Outside development, the built-in local default is rejected. |
| `MONEYMAP_SKIP_SEED` | Set to `1` to skip the fictional demo user. Tests set this themselves. |
| `OPENAI_API_KEY` | Server-side key for the assistant. Leave it blank to turn the assistant off. |
| `OPENAI_MODEL` | Model name. Defaults to `gpt-4o-mini` when unset. |
| `OPENAI_TIMEOUT` | Seconds to wait for OpenAI. Defaults to 20, clamped between 1 and 60. |
| `OPENAI_MAX_OUTPUT_TOKENS` | Reply length. Defaults to 400, clamped between 50 and 800. |

The API key is read only by the backend. It is not sent to the browser, and there is no `VITE_OPENAI_API_KEY`.

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

Open http://127.0.0.1:8000/docs to see the routes in the FastAPI documentation page. The health check does not call OpenAI. A missing API key does not stop the rest of the app.

## Database

Starting the backend creates `backend/moneymap.db` if that file is missing, and creates any tables that are not there yet. Startup does not delete or rewrite users, accounts, categories, transactions, budgets, holdings, bills, or payments. `create_all()` does not add columns to tables that already exist. The checked-in models match the tables in the local database, so no migration was required.

The database file is local and is not committed. Do not delete it if you want to keep your records. After a laptop restart, start the backend again and the same file is opened.

Amounts are stored as integer cents. Income is a positive amount and an expense is a negative amount. The dashboard adds positive amounts for income and the absolute value of negative amounts for expenses. There is no transfer type, so every saved amount is included. A budget limit is not spending.

Account balances are the running sum of that account's transactions. Creating, editing, deleting, or moving a transaction updates the affected balances in the same database commit. Net worth is the sum of checking, savings, and cash balances plus each simulated holding's current value. Holdings are not copied into an account, so they are not counted twice. There is no loan or credit-card account type. A negative balance lowers net worth.

A holding quantity is stored as an integer scaled by 10,000. Current value is quantity times the price you entered, using integer division to the cent. Those prices are not live.

Marking a bill paid writes one expense, records one payment for that due date, and moves the next due date. The same due date cannot be paid twice. Deleting that expense also removes its payment record and restores the account balance. The bill's next due date is not moved backward. Deleting the bill leaves the expense in the transaction list.

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

- Dashboard shows the selected month: income, expenses, net cash flow, spending by category, budget progress, recent transactions, and a six-month comparison.
- Accounts lists checking, savings, and cash accounts, their balances, and net worth.
- Investments stores quantities and prices you type in. Prices are not live.
- Bills tracks upcoming and overdue items. Mark paid creates one expense and moves the next due date. It does not charge anyone.
- Transactions can import a CSV after a preview.
- Assistant answers questions about the signed-in user's saved records when `OPENAI_API_KEY` is set.

A budget is a spending limit. It is not itself a transaction.

Routes that require a login token:

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/accounts`, `POST /api/accounts`, `PUT /api/accounts/{account_id}`, `DELETE /api/accounts/{account_id}`
- `GET /api/categories`, `POST /api/categories`
- `GET /api/transactions`, `POST /api/transactions`, `PUT /api/transactions/{transaction_id}`, `DELETE /api/transactions/{transaction_id}`
- `GET /api/net-worth`
- `GET /api/holdings`, `POST /api/holdings`, `PUT /api/holdings/{holding_id}`, `DELETE /api/holdings/{holding_id}`
- `GET /api/bills`, `POST /api/bills`, `PUT /api/bills/{bill_id}`, `DELETE /api/bills/{bill_id}`, `POST /api/bills/{bill_id}/pay`, `GET /api/bills/payments`
- `POST /api/imports/preview`, `POST /api/imports`
- `GET /api/budgets?month=YYYY-MM`, `POST /api/budgets`, `PUT /api/budgets/{budget_id}`, `DELETE /api/budgets/{budget_id}`
- `GET /api/dashboard?month=YYYY-MM`
- `GET /api/ai/status`, `POST /api/ai/chat`

Deleting an account that still has transactions returns a conflict. You can move those transactions to another account with `?reassign_to={account_id}`, or remove them with `?confirm=delete-transactions`.

## Import a CSV

On Transactions, choose a `.csv` file of at most 1 MB and 500 data rows. Preview it, then import the valid rows. The server reads the upload in memory and does not save the file. If nothing is valid, the page says that nothing was imported. Invalid and duplicate rows are listed and are not saved.

A MoneyMap file uses these columns:

```csv
date,description,amount,type,category,account
2026-10-03,Harbor Market,12.50,expense,Groceries,Cash
2026-10-04,Payroll,100.00,income,Pay,Cash
```

`amount` is a positive number of dollars. `type` is `income` or `expense`. `category` and `account` must already exist for the signed-in user.

A bank export can use common headers instead: `transaction date` or `posted date`, `description` or `memo`, `amount`, and `transaction type` (`Debit` or `Credit`). Separate `Debit` and `Credit` columns also work. Dates can be `YYYY-MM-DD` or `MM/DD/YYYY`. A negative amount is an expense. If the file has no account or category column, choose them on the Transactions page before preview. Those choices are used only for rows that do not name an account or category. A fictional sample is at `frontend/public/sample-bank-statement.csv`.

A row that matches an existing transaction, or an earlier row in the same file, on date, description, amount, category, and account is skipped as a duplicate.

## Assistant

The assistant is optional. All OpenAI calls are made from FastAPI. The browser only calls `GET /api/ai/status` and `POST /api/ai/chat`.

MoneyMap calculates income, expenses, budget progress, balances, and holding values in Python, then asks the model to explain that snapshot. The snapshot omits email addresses, passwords, and tokens. Transaction descriptions are sent as untrusted text, not as instructions. Chat is kept in the browser for the current visit and is not stored in SQLite. Requests are limited to 8 per user per minute, questions are limited to 1,000 characters, and history is limited to the last 6 messages. Failed calls are not retried. The request disables stored responses and does not enable web search, file search, or image tools.

The default model is `gpt-4o-mini`, which OpenAI documents as a low-cost text model on the Responses API. Your API account still has to have access to it. If a request says the model is unavailable, set `OPENAI_MODEL` in `backend/.env` to a model your account can use and restart the backend.

API usage is billed separately from a ChatGPT subscription. In the OpenAI platform, open Usage to see spend and set a monthly budget or an email alert where those controls are offered: https://platform.openai.com/settings/organization/limits and https://platform.openai.com/usage. A few short questions against `gpt-4o-mini` with the limits above should stay well under a few cents, but the platform limits are the control that actually stops spend.

To try the key without sending financial records:

```bash
cd ~/Projects/MoneyMap/backend
source .venv/bin/activate
python scripts/check_ai.py
```

That script is not part of `pytest`. The automated tests mock OpenAI and do not need a key.

## Build the frontend

From the frontend folder:

```bash
npm run lint
npm run build
```

The page asks its own server for `/api/health`. Vite forwards any path that starts with `/api` to FastAPI on port 8000, for both `npm run dev` and `npm run preview`. The browser does not call port 8000 directly.

Check that forward from a terminal:

```bash
curl http://127.0.0.1:5173/api/health
```

The JSON should match the backend health check. Both servers must be running.

## Tests

From the backend folder, with the virtual environment active:

```bash
python -m pytest
```

The tests use a temporary database, so they do not delete `backend/moneymap.db`. They cover registration, login, transactions, budgets, dashboard totals, accounts, net worth, holdings, bills, CSV import, the assistant with mocked responses, and the rule that one user cannot read another user's records.

## After a restart

Start the backend, then the frontend, using the commands above. Your SQLite file and `backend/.env` stay on disk. You do not need to register again.

## Limitations

- Investments are manual. There is no live price feed and no brokerage connection.
- There is no bank connection and no place to enter bank credentials.
- There are no loan or credit-card accounts.
- Marking a bill paid writes a normal expense. It does not send money anywhere.
- There is no transfer type. Every saved transaction counts as income or an expense by its sign.
- The assistant is an explanation of saved records. It is not professional financial, tax, or investment advice, and it cannot change those records.
- This app is for local use. Do not put the development token secret on a public server.

The `sqlite3` command line does not turn on foreign keys by itself. This app turns them on for each connection it opens. To see that setting through the app:

```bash
python -c "from app.database import SessionLocal; from sqlalchemy import text; db = SessionLocal(); print(db.execute(text('PRAGMA foreign_keys')).scalar()); db.close()"
```

The printed value should be `1`.
