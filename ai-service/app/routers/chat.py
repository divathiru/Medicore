"""
app/routers/chat.py — RAG chat endpoints.

POST /chat/public
    Body: { question: str }
    No auth required — gateway allows this route through without JWT.
    Retrieves from namespace='public', calls Mistral, returns answer + sources.

POST /chat/patient
    Body: { patient_id: str (UUID), question: str }
    Auth enforced by gateway (any valid JWT) + doctor-service (appointment check).
    Retrieval MUST include WHERE namespace='patient' AND patient_id = :pid
    at the SQL level — this is the primary enforcement layer for patient isolation.
    Every call is logged to stdout for auditability.

PROMPT-INJECTION DEFENSE (build guide §3.7):
  - System prompt (trusted) is a separate "system" role message.
  - Retrieved chunks are wrapped in explicit "[REFERENCE MATERIAL]" label.
  - System prompt instructs the model to refuse instruction-reveal requests.
  - patient_id SQL filter is the enforcement layer, not just a prompt hint.
  - Every /chat/patient call logged with {patient_id, question, timestamp}.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from mistralai import Mistral
from pydantic import BaseModel, field_validator

from app.db import get_conn
from app.embeddings import embed_single
from app.prompts import (
    SYSTEM_PROMPT_PATIENT,
    SYSTEM_PROMPT_PUBLIC,
    build_patient_user_message,
    build_public_user_message,
)

router = APIRouter()

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

CHAT_MODEL = "mistral-small-latest"  # swap to mistral-large for prod
TOP_K = 5  # number of chunks to retrieve per query

# --------------------------------------------------------------------------- #
# Request / response models
# --------------------------------------------------------------------------- #


class PublicChatRequest(BaseModel):
    question: str

    @field_validator("question")
    @classmethod
    def question_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be empty")
        return v


class PatientChatRequest(BaseModel):
    patient_id: str
    question: str

    @field_validator("patient_id")
    @classmethod
    def valid_uuid(cls, v: str) -> str:
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError("patient_id must be a valid UUID")
        return v

    @field_validator("question")
    @classmethod
    def question_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be empty")
        return v


# --------------------------------------------------------------------------- #
# Shared helpers
# --------------------------------------------------------------------------- #


def _get_mistral_client() -> Mistral:
    api_key = os.environ.get("MISTRAL_API_KEY")
    if not api_key:
        raise RuntimeError("MISTRAL_API_KEY not set")
    return Mistral(api_key=api_key)


def _retrieve_public(query_vector: list[float], top_k: int) -> list[dict]:
    """
    Cosine-similarity search restricted to namespace='public'.
    Returns a list of { content, metadata, similarity } dicts.
    """
    vec_str = "[" + ",".join(str(v) for v in query_vector) + "]"
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT content,
                   metadata,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM public.embeddings
            WHERE namespace = 'public'
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (vec_str, vec_str, top_k),
        ).fetchall()
    return [
        {"content": r[0], "metadata": r[1] or {}, "similarity": float(r[2])}
        for r in rows
    ]


def _retrieve_patient(
    query_vector: list[float], patient_id: str, top_k: int
) -> list[dict]:
    """
    Cosine-similarity search HARD-FILTERED to namespace='patient'
    AND patient_id = :patient_id.

    IMPORTANT: Both filter conditions are enforced at the SQL WHERE clause.
    They are NOT prompt instructions and cannot be overridden by ingested text.
    This is the primary patient-isolation guarantee.
    """
    vec_str = "[" + ",".join(str(v) for v in query_vector) + "]"
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT content,
                   metadata,
                   1 - (embedding <=> %s::vector) AS similarity
            FROM public.embeddings
            WHERE namespace  = 'patient'
              AND patient_id = %s::uuid
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (vec_str, patient_id, vec_str, top_k),
        ).fetchall()
    return [
        {"content": r[0], "metadata": r[1] or {}, "similarity": float(r[2])}
        for r in rows
    ]


def _call_mistral(system_prompt: str, user_message: str) -> str:
    """
    Call Mistral chat completion with a separate system role message.
    The system prompt is NEVER mixed with retrieved content — it is always
    the first message in the array, in the 'system' role.
    """
    client = _get_mistral_client()
    response = client.chat.complete(
        model=CHAT_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    return response.choices[0].message.content


def _extract_sources(chunks: list[dict]) -> list[str]:
    """Extract unique source/section names from chunk metadata."""
    sources = []
    seen = set()
    for chunk in chunks:
        meta = chunk.get("metadata") or {}
        src = (
            meta.get("section_name")
            or meta.get("source")
            or "Unknown"
        )
        if src not in seen:
            sources.append(src)
            seen.add(src)
    return sources


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #


@router.post("/public")
def chat_public(body: PublicChatRequest):
    """
    Public hospital-info chatbot.  No auth required.
    """
    try:
        query_vec = embed_single(body.question)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding API error: {exc}") from exc

    try:
        chunks = _retrieve_public(query_vec, TOP_K)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    if not chunks:
        return {
            "answer": (
                "I don't have that information — please contact MediCore directly."
            ),
            "sources": [],
        }

    user_msg = build_public_user_message(body.question, chunks)

    try:
        answer = _call_mistral(SYSTEM_PROMPT_PUBLIC, user_msg)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM API error: {exc}") from exc

    return {"answer": answer, "sources": _extract_sources(chunks)}


@router.post("/patient")
def chat_patient(body: PatientChatRequest):
    """
    Per-patient doctor chatbot.  Retrieval is hard-filtered at the SQL level
    to namespace='patient' AND patient_id = body.patient_id.

    Every call is logged to stdout for auditability (CloudWatch-ready).
    """
    # ── Audit log ────────────────────────────────────────────────────────────
    # Log BEFORE the LLM call so cross-patient attempts are captured even if
    # the call fails.  doctor_id is not available here (ai-service has no JWT
    # context); doctor-service already verified the appointment relationship
    # and logs the doctor identity at its layer.
    ts = datetime.now(timezone.utc).isoformat()
    print(
        f"[AUDIT /chat/patient] ts={ts} patient_id={body.patient_id} "
        f"question={body.question!r}",
        file=sys.stdout,
        flush=True,
    )

    try:
        query_vec = embed_single(body.question)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Embedding API error: {exc}") from exc

    # ── SQL-level patient isolation (PRIMARY enforcement layer) ──────────────
    # WHERE namespace='patient' AND patient_id = :patient_id
    # This cannot be overridden by prompt injection or client input.
    try:
        chunks = _retrieve_patient(query_vec, body.patient_id, TOP_K)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    if not chunks:
        return {
            "answer": "No relevant information found in this patient's records.",
            "sources": [],
        }

    user_msg = build_patient_user_message(body.patient_id, body.question, chunks)

    try:
        answer = _call_mistral(SYSTEM_PROMPT_PATIENT, user_msg)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM API error: {exc}") from exc

    return {"answer": answer, "sources": _extract_sources(chunks)}
