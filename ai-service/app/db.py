"""
app/db.py — PostgreSQL connection pool for ai-service.

Uses psycopg v3 (synchronous) with a connection pool.
The pool is initialised once at application startup via lifespan,
and torn down on shutdown.

Usage:
    from app.db import get_conn

    with get_conn() as conn:
        rows = conn.execute("SELECT ...", params).fetchall()
"""

import os
from contextlib import contextmanager

import psycopg
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


def init_pool() -> None:
    """Called once at FastAPI lifespan startup."""
    global _pool
    db_url = os.environ["DATABASE_URL"]
    _pool = ConnectionPool(
        conninfo=db_url,
        min_size=2,
        max_size=10,
        open=True,
    )


def close_pool() -> None:
    """Called once at FastAPI lifespan shutdown."""
    global _pool
    if _pool:
        _pool.close()
        _pool = None


@contextmanager
def get_conn():
    """Context manager that yields a psycopg connection from the pool."""
    if _pool is None:
        raise RuntimeError("DB pool not initialised. Call init_pool() first.")
    with _pool.connection() as conn:
        yield conn
