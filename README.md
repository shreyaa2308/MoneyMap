# MoneyMap

MoneyMap is a local personal finance app. The website talks to the API through a local proxy, and the API stores data in SQLite. Login and financial features come in later milestones.

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

Starting the backend also creates `backend/moneymap.db` if that file is missing. The file is local and is not committed.

## Run the frontend

In another terminal:

```bash
cd ~/Projects/MoneyMap/frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. You should see the MoneyMap page and the line `Backend: connected, database ok`.

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

Three tests should pass. They create a temporary database, confirm the tables exist, and confirm SQLite rejects a row that points at a missing user.

The `sqlite3` command line does not turn on foreign keys by itself. This app turns them on for each connection it opens. To see that setting through the app:

```bash
python -c "from app.database import SessionLocal; from sqlalchemy import text; db = SessionLocal(); print(db.execute(text('PRAGMA foreign_keys')).scalar()); db.close()"
```

The printed value should be `1`.
