#!/usr/bin/env python3
"""
scripts/ingest_seed_docs.py — One-off CLI ingestion script for seed-docs/.

Usage
-----
  # Inside Docker (recommended after docker compose up)
  docker compose exec ai-service python scripts/ingest_seed_docs.py

  # Locally (with venv active inside ai-service/)
  python scripts/ingest_seed_docs.py

  # Force re-embed files already present in the DB
  python scripts/ingest_seed_docs.py --force

What it does
------------
1. Walks ai-service/seed-docs/, collecting .pdf / .txt / .md files.
2. For each file:
   a. Checks if metadata->>'source_file' already exists in public embeddings.
      If yes and --force is NOT set → SKIP.
   b. Extracts plain text: pdfplumber for .pdf, plain read for .txt/.md.
   c. Calls app.ingestion.ingest_text_direct() to chunk → embed → insert.
3. Prints a per-file summary at the end.

The script talks directly to Postgres (DATABASE_URL) and Mistral
(MISTRAL_API_KEY) — ai-service's HTTP server does NOT need to be running.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# ── Make sure 'app' is importable whether we're run inside the container
# (CWD=/app) or locally from ai-service/ ───────────────────────────────────
_HERE = Path(__file__).resolve().parent          # ai-service/scripts/
_AI_SERVICE_ROOT = _HERE.parent                   # ai-service/
if str(_AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_SERVICE_ROOT))

# Load .env before importing app modules that read os.environ at import time
from dotenv import load_dotenv  # noqa: E402  (app dep, always available)

_env_path = _AI_SERVICE_ROOT / ".env"
if _env_path.exists():
    load_dotenv(_env_path)

# Now import app modules (they read env vars at call time, not import time,
# except tiktoken in chunker — which is fine).
import psycopg                                    # noqa: E402
from app.ingestion import ingest_text_direct, source_file_already_ingested  # noqa: E402

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
SEED_DOCS_DIR = _AI_SERVICE_ROOT / "seed-docs"
SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}
SKIP_FILENAMES = {".gitkeep", "README.md"}


# --------------------------------------------------------------------------- #
# Text extraction
# --------------------------------------------------------------------------- #
def extract_text(file_path: Path) -> str:
    """
    Extract plain text from *file_path* based on its suffix.
    Raises ValueError for unsupported types.
    """
    suffix = file_path.suffix.lower()

    if suffix == ".pdf":
        import pdfplumber  # noqa: PLC0415 (optional dep, only needed for PDFs)
        with pdfplumber.open(file_path) as pdf:
            pages = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)
            return "\n\n".join(pages)

    elif suffix in {".txt", ".md"}:
        return file_path.read_text(encoding="utf-8", errors="replace")

    else:
        raise ValueError(f"Unsupported file type: {suffix!r}")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest seed-docs/ into the public RAG corpus."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-embed files even if they are already present in the DB.",
    )
    args = parser.parse_args()

    # Validate env vars early
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("[ERROR] DATABASE_URL is not set. Aborting.", file=sys.stderr)
        sys.exit(1)
    if not os.environ.get("MISTRAL_API_KEY"):
        print("[ERROR] MISTRAL_API_KEY is not set. Aborting.", file=sys.stderr)
        sys.exit(1)

    # Collect candidate files
    if not SEED_DOCS_DIR.is_dir():
        print(f"[ERROR] seed-docs directory not found at {SEED_DOCS_DIR}", file=sys.stderr)
        sys.exit(1)

    candidates: list[Path] = []
    for entry in sorted(SEED_DOCS_DIR.iterdir()):
        if entry.name in SKIP_FILENAMES:
            continue
        if not entry.is_file():
            continue
        if entry.suffix.lower() not in SUPPORTED_EXTENSIONS:
            print(f"[WARN ] {entry.name} — unsupported type '{entry.suffix}', skipping.")
            continue
        candidates.append(entry)

    if not candidates:
        print("No supported files found in seed-docs/. Nothing to ingest.")
        return

    print(f"Found {len(candidates)} file(s) in seed-docs/.\n")

    # Open one DB connection for the whole run
    results: list[dict] = []
    with psycopg.connect(db_url) as conn:
        for file_path in candidates:
            filename = file_path.name
            entry: dict = {"file": filename, "status": None, "chunks": 0}

            # Duplicate check
            if not args.force and source_file_already_ingested(conn, filename):
                entry["status"] = "SKIPPED (already ingested; use --force to re-embed)"
                results.append(entry)
                continue

            # Text extraction
            try:
                text = extract_text(file_path)
            except ValueError as exc:
                entry["status"] = f"WARN — {exc}"
                results.append(entry)
                continue
            except Exception as exc:
                entry["status"] = f"FAILED (extraction): {exc}"
                results.append(entry)
                continue

            if not text.strip():
                entry["status"] = "FAILED — no extractable text found"
                results.append(entry)
                continue

            # Ingest
            try:
                inserted = ingest_text_direct(
                    conn=conn,
                    text=text,
                    namespace="public",
                    patient_id=None,
                    extra_meta={"source_file": filename, "ingested_by": "seed_script"},
                )
                conn.commit()
                entry["status"] = "INSERTED"
                entry["chunks"] = inserted
            except Exception as exc:
                conn.rollback()
                entry["status"] = f"FAILED (ingest): {exc}"

            results.append(entry)

    # Summary
    print("\n" + "─" * 60)
    print(f"{'FILE':<35} {'CHUNKS':>6}  STATUS")
    print("─" * 60)
    for r in results:
        chunks_str = str(r["chunks"]) if r["chunks"] else "—"
        print(f"{r['file']:<35} {chunks_str:>6}  {r['status']}")
    print("─" * 60)

    inserted_count = sum(1 for r in results if r["status"] == "INSERTED")
    skipped_count  = sum(1 for r in results if "SKIPPED" in (r["status"] or ""))
    failed_count   = sum(1 for r in results if "FAILED" in (r["status"] or ""))
    print(f"\nDone.  {inserted_count} inserted / {skipped_count} skipped / {failed_count} failed.\n")


if __name__ == "__main__":
    main()
