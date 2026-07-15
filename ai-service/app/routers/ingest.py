"""
app/routers/ingest.py — RAG ingestion endpoints.

POST /ingest/hospital-docs
    Body: { text: str, section_name: str? }
    Chunks + embeds the given text with namespace='public'.
    Called once (or occasionally) by an admin to load static hospital content.

POST /ingest/patient/{patient_id}
    Body: { text: str, source: str? }
    Chunks + embeds the given text with namespace='patient', patient_id set.
    Called by patient-service (summary upload) and doctor-service (prescription).

Both endpoints:
  - Validate input with Pydantic.
  - Chunk with app.chunker.chunk_text.
  - Embed with app.embeddings.embed_texts.
  - Bulk-insert into public.embeddings via psycopg executemany.
  - Return { "inserted": <int> }.
"""

from __future__ import annotations

import json
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.chunker import chunk_text
from app.db import get_conn
from app.embeddings import embed_texts

router = APIRouter()

# --------------------------------------------------------------------------- #
# Request models
# --------------------------------------------------------------------------- #

class HospitalDocsRequest(BaseModel):
    text: str
    section_name: Optional[str] = "Hospital Information"

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be empty")
        return v


class PatientIngestRequest(BaseModel):
    text: str
    source: Optional[str] = None

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be empty")
        return v


# --------------------------------------------------------------------------- #
# Shared helper
# --------------------------------------------------------------------------- #

def _insert_embeddings(
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
    """
    rows = []
    for chunk, vector in zip(chunks, vectors):
        row_id = str(uuid.uuid4())
        meta = {**extra_meta, "chunk_length": len(chunk)}
        # pgvector expects the embedding as a list literal string: '[0.1, 0.2, ...]'
        vec_str = "[" + ",".join(str(v) for v in vector) + "]"
        rows.append((row_id, namespace, patient_id, chunk, vec_str, json.dumps(meta)))

    conn.executemany(
        """
        INSERT INTO public.embeddings
            (id, namespace, patient_id, content, embedding, metadata)
        VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb)
        """,
        rows,
    )
    return len(rows)


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@router.post("/hospital-docs")
def ingest_hospital_docs(body: HospitalDocsRequest):
    """
    Chunk and embed static hospital content (namespace='public').
    Admin/one-time use — no auth at the service layer (gateway enforces JWT).
    """
    chunks = list(chunk_text(body.text))
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks produced from input text.")

    try:
        vectors = embed_texts(chunks)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding API error: {exc}") from exc

    try:
        with get_conn() as conn:
            inserted = _insert_embeddings(
                conn=conn,
                namespace="public",
                patient_id=None,
                chunks=chunks,
                vectors=vectors,
                extra_meta={"section_name": body.section_name},
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    return {"inserted": inserted, "section_name": body.section_name}


@router.post("/patient/{patient_id}")
def ingest_patient(patient_id: str, body: PatientIngestRequest):
    """
    Chunk and embed patient-specific text (namespace='patient').
    Called by patient-service and doctor-service whenever new text is available.
    """
    # Basic UUID format check (not strict — the DB FK enforces validity)
    try:
        uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="patient_id must be a valid UUID.")

    chunks = list(chunk_text(body.text))
    if not chunks:
        raise HTTPException(status_code=400, detail="No chunks produced from input text.")

    try:
        vectors = embed_texts(chunks)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding API error: {exc}") from exc

    try:
        with get_conn() as conn:
            inserted = _insert_embeddings(
                conn=conn,
                namespace="patient",
                patient_id=patient_id,
                chunks=chunks,
                vectors=vectors,
                extra_meta={"source": body.source or "unknown"},
            )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    return {"inserted": inserted, "patient_id": patient_id}
