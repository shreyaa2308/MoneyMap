from fastapi import FastAPI

app = FastAPI(title="MoneyMap")


@app.get("/api/health")
def health():
    """Report that the API process is running."""
    return {"status": "ok"}
