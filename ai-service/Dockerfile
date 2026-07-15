# =============================================================
# ai-service Dockerfile — python:3.11-slim, multi-stage
# Stage 1: install dependencies (cached layer)
# Stage 2: copy source and run
# =============================================================
FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies needed by psycopg (libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# ── Dependency layer (cached unless requirements.txt changes) ─
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application source ────────────────────────────────────────
COPY . .

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')" || exit 1

EXPOSE 5000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
