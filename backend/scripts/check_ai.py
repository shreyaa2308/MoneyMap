"""Optional connectivity check for a real OpenAI key.

This file is not part of pytest. It sends one short prompt and no MoneyMap
records. Running it spends a small amount of API credit when OPENAI_API_KEY
is set.

From the backend folder:

    ./.venv/bin/python scripts/check_ai.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai_client import AIServiceError, AIUnavailable, complete


def main():
    try:
        reply, model = complete(
            "Reply with exactly: ready",
            [],
            "Connectivity check only. No financial records are included.",
        )
    except AIUnavailable as exc:
        print(exc)
        return 0
    except AIServiceError as exc:
        print(exc.public_message)
        return 1
    except Exception as exc:
        print(f"The AI check failed ({type(exc).__name__}).")
        return 1
    print(f"model={model}")
    print(reply)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
