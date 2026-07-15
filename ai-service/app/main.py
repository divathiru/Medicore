"""
app/main.py — FastAPI application entry point for MediCore ai-service.

Startup sequence (lifespan):
  1. Validate required env vars.
  2. Initialise the psycopg connection pool.
  3. Register routers.
  4. On shutdown: close the pool cleanly.

Routers:
  /ingest/* → app.routers.ingest
  /chat/*   → app.routers.chat
  GET /health → inline (no DB dependency, returns fast)
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import close_pool, init_pool
from app.routers import chat, ingest

# --------------------------------------------------------------------------- #
# Env var validation (fail fast at startup, not at first request)
# --------------------------------------------------------------------------- #
REQUIRED_ENV = ["DATABASE_URL", "MISTRAL_API_KEY"]


def _validate_env() -> None:
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            f"[ai-service] Missing required environment variables: {missing}"
        )


# --------------------------------------------------------------------------- #
# Lifespan — startup / shutdown
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_env()
    init_pool()
    print("[ai-service] Database pool initialised.", flush=True)
    yield
    close_pool()
    print("[ai-service] Database pool closed.", flush=True)


# --------------------------------------------------------------------------- #
# App
# --------------------------------------------------------------------------- #
app = FastAPI(
    title="MediCore AI Service",
    description=(
        "Dual RAG pipelines: public hospital-info chatbot + "
        "per-patient doctor chatbot. Built on Mistral AI + pgvector."
    ),
    version="1.0.0",
    lifespan=lifespan,
    # Disable the default /docs and /redoc in production; fine for dev
    docs_url="/docs",
    redoc_url="/redoc",
)

# --------------------------------------------------------------------------- #
# Routers
# --------------------------------------------------------------------------- #
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])


# --------------------------------------------------------------------------- #
# Health check
# --------------------------------------------------------------------------- #
@app.get("/health", tags=["ops"])
def health():
    """Required by build spec — returns fast, no DB ping."""
    return {"status": "ok"}
