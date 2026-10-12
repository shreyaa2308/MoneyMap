# MoneyMap

MoneyMap is a local personal finance app. This block only runs the backend health check. The website, database, and login come in later blocks.

## Requirements

- Python 3.12 or newer. This project uses the virtual environment in `backend/.venv`, which was created with Python 3.14.
- The system `python3` on macOS may still be an older version. Use the virtual environment below so the app does not pick that one up.

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
{"status":"ok"}
```

Open http://127.0.0.1:8000/docs to see the same route in the FastAPI documentation page.
