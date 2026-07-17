"""
app/ingestion.py — Shared ingestion helpers.

This module is the single source of truth for:
  - chunk_and_embed_text(): chunk text → embed → return (chunks, vectors)
  - insert_embeddings(): bulk-insert into public.embeddings
  - ingest_text_direct(): end-to-end, returns inserted count,
      raises plain Python exceptions (NOT FastAPI HTTPException) so it can
      be called from both the FastAPI router and CLI scripts.

The FastAPI router (app/routers/ingest.py) wraps these in HTTPException
handling.  The CLI script (scripts/ingest_seed_docs.py) calls them directly
and handles errors with sys.exit / print.

DB NOTE: The functions that touch the DB accept a psycopg Connection object
so callers control transaction / pool lifecycle themselves.
"""

from __future__ import annotations

import json
import uuid
from typing import Optional

from app.chunker import chunk_text
from app.embeddings import embed_texts


# --------------------------------------------------------------------------- #
# Core pipeline steps
# --------------------------------------------------------------------------- #

def chunk_and_embed(text: str) -> tuple[list[str], list[list[float]]]:
    """
    Chunk *text* and return (chunks, embedding_vectors).
    Raises ValueError if the text produces no chunks.
    Raises RuntimeError if the embedding API call fails.
    """
    chunks = list(chunk_text(text))
    if not chunks:
        raise ValueError("No chunks produced from input text.")

    try:
        vectors = embed_texts(chunks)
    except Exception as exc:
        raise RuntimeError(f"Embedding API error: {exc}") from exc

    return chunks, vectors


def insert_embeddings(
    conn,
    namespace: str,
    patient_id: Optional[str],
    chunks: list[str],
    vectors: list[list[float]],
    extra_meta: dict,
) -> int:
    """
    Bulk-insert (chunk, embedding) pairs into public.embeddings.
    Returns the count of rows inserted.

    *conn* must be an open psycopg Connection (v3).
    psycopg3 Connection has no .executemany() — we open an explicit cursor.
    """
    rows = []
    for chunk, vector in zip(chunks, vectors):
        row_id = str(uuid.uuid4())
        meta = {**extra_meta, "chunk_length": len(chunk)}
        vec_str = "[" + ",".join(str(v) for v in vector) + "]"
        rows.append(
            (row_id, namespace, patient_id, chunk, vec_str, json.dumps(meta))
        )

    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO public.embeddings
                (id, namespace, patient_id, content, embedding, metadata)
            VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb)
            """,
            rows,
        )
    return len(rows)


def ingest_text_direct(
    conn,
    text: str,
    namespace: str,
    patient_id: Optional[str],
    extra_meta: dict,
) -> int:
    """
    End-to-end: chunk → embed → insert.  Returns inserted count.
    Raises ValueError / RuntimeError on failure (no HTTPException here).
    *conn* is an open psycopg Connection.
    """
    chunks, vectors = chunk_and_embed(text)
    return insert_embeddings(
        conn=conn,
        namespace=namespace,
        patient_id=patient_id,
        chunks=chunks,
        vectors=vectors,
        extra_meta=extra_meta,
    )


def source_file_already_ingested(conn, source_file: str, namespace: str = "public") -> bool:
    """
    Return True if at least one row in public.embeddings has
    metadata->>'source_file' = source_file and namespace = namespace.
    Used by the seed script to skip already-processed files.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM public.embeddings
            WHERE namespace = %s
              AND metadata->>'source_file' = %s
            LIMIT 1
            """,
            (namespace, source_file),
        )
        return cur.fetchone() is not None
