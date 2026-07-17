"""
app/routers/ingest.py — RAG ingestion endpoints.

POST /ingest/hospital-docs
    Body: { text: str, section_name: str? }
    Chunks + embeds the given text with namespace='public'.
    Called once (or occasionally) to load static hospital content.

POST /ingest/hospital-docs/upload
    Multipart: one or more PDF files (field name: "files").
    Extracts text from each PDF with pymupdf, chunks + embeds each,
    returns per-file results.  Use this to bulk-ingest the 10 hospital PDFs.

POST /ingest/patient/{patient_id}
    Body: { text: str, source: str? }
    Chunks + embeds the given text with namespace='patient', patient_id set.
    Called by patient-service (text paste) and doctor-service (prescription).

POST /ingest/patient/{patient_id}/upload
    Multipart: a single PDF/image file (field name: "file").
    Extracts text from the uploaded file with pymupdf, then ingest as patient
    namespace.  Called by patient-service when a patient uploads a file.

Both JSON endpoints:
  - Validate input with Pydantic.
  - Chunk with app.chunker.chunk_text.
  - Embed with app.embeddings.embed_texts.
  - Bulk-insert into public.embeddings via psycopg executemany.
  - Return { "inserted": <int> }.
"""

from __future__ import annotations

import uuid
from typing import Optional

import fitz  # pymupdf
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, field_validator

from app.db import get_conn
from app.ingestion import ingest_text_direct

router = APIRouter()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _extract_pdf_text(file_bytes: bytes) -> str:
    """
    Extract all text from a PDF (or image) using pymupdf.
    Falls back gracefully — returns empty string if extraction fails.
    """
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        pages = []
        for page in doc:
            pages.append(page.get_text("text"))
        doc.close()
        return "\n\n".join(pages).strip()
    except Exception as exc:
        raise ValueError(f"PDF text extraction failed: {exc}") from exc


def _ingest_text(
    text: str,
    namespace: str,
    patient_id: Optional[str],
    extra_meta: dict,
) -> int:
    """Thin FastAPI wrapper: delegates to app.ingestion.ingest_text_direct."""
    try:
        with get_conn() as conn:
            return ingest_text_direct(
                conn=conn,
                text=text,
                namespace=namespace,
                patient_id=patient_id,
                extra_meta=extra_meta,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc


# --------------------------------------------------------------------------- #
# Request models (JSON endpoints)
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
    source_type: Optional[str] = None        # 'old_summary' | 'prescription'
    appointment_id: Optional[str] = None     # set when source_type='prescription'

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be empty")
        return v


# --------------------------------------------------------------------------- #
# Endpoints — JSON (text paste)
# --------------------------------------------------------------------------- #

@router.post("/hospital-docs")
def ingest_hospital_docs(body: HospitalDocsRequest):
    """
    Chunk and embed static hospital content (namespace='public').
    Accepts plain text — use /hospital-docs/upload for PDF files.
    """
    inserted = _ingest_text(
        text=body.text,
        namespace="public",
        patient_id=None,
        extra_meta={"section_name": body.section_name},
    )
    return {"inserted": inserted, "section_name": body.section_name}


@router.post("/patient/{patient_id}")
def ingest_patient(patient_id: str, body: PatientIngestRequest):
    """
    Chunk and embed patient-specific text (namespace='patient').
    Called by patient-service and doctor-service whenever new text is available.
    """
    try:
        uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="patient_id must be a valid UUID.")

    extra_meta: dict = {"source": body.source or "unknown"}
    if body.source_type:
        extra_meta["source_type"] = body.source_type
    if body.appointment_id:
        extra_meta["appointment_id"] = body.appointment_id

    inserted = _ingest_text(
        text=body.text,
        namespace="patient",
        patient_id=patient_id,
        extra_meta=extra_meta,
    )
    return {"inserted": inserted, "patient_id": patient_id}


# --------------------------------------------------------------------------- #
# Endpoints — File upload (PDF extraction)
# --------------------------------------------------------------------------- #

@router.post("/hospital-docs/upload")
async def ingest_hospital_docs_upload(
    files: list[UploadFile] = File(..., description="One or more PDF files to ingest"),
):
    """
    Accept multiple PDF files, extract text with pymupdf, chunk + embed each.
    Returns per-file results so the caller knows exactly what was ingested.

    This is the endpoint to call for the 10 hospital PDFs.
    """
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    results = []
    for upload in files:
        filename = upload.filename or "unknown.pdf"
        try:
            raw = await upload.read()
            if not raw:
                results.append({"file": filename, "error": "Empty file", "inserted": 0})
                continue

            text = _extract_pdf_text(raw)
            if not text.strip():
                results.append({"file": filename, "error": "No extractable text found in PDF", "inserted": 0})
                continue

            inserted = _ingest_text(
                text=text,
                namespace="public",
                patient_id=None,
                extra_meta={"section_name": filename, "source": "pdf_upload"},
            )
            results.append({"file": filename, "inserted": inserted, "chars": len(text)})

        except ValueError as exc:
            results.append({"file": filename, "error": str(exc), "inserted": 0})
        except HTTPException as exc:
            results.append({"file": filename, "error": exc.detail, "inserted": 0})
        except Exception as exc:
            results.append({"file": filename, "error": f"Unexpected error: {exc}", "inserted": 0})

    total_inserted = sum(r.get("inserted", 0) for r in results)
    return {
        "total_inserted": total_inserted,
        "files_processed": len(results),
        "results": results,
    }


@router.post("/patient/{patient_id}/upload")
async def ingest_patient_upload(
    patient_id: str,
    file: UploadFile = File(..., description="PDF or image file to extract and ingest"),
    source: Optional[str] = None,
):
    """
    Extract text from an uploaded patient file (PDF/image) and ingest into
    the patient's RAG namespace.

    Called by patient-service when a patient uploads a medical record file —
    this ensures the file content (not just pasted text) goes into the vector
    store so the doctor's AI assistant can retrieve it.
    """
    try:
        uuid.UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="patient_id must be a valid UUID.")

    filename = file.filename or "upload"

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        text = _extract_pdf_text(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in the uploaded file. "
                   "Try a text-based PDF or paste the text manually.",
        )

    inserted = _ingest_text(
        text=text,
        namespace="patient",
        patient_id=patient_id,
        extra_meta={"source": source or filename, "extracted_from": "pdf_upload"},
    )

    return {
        "inserted": inserted,
        "patient_id": patient_id,
        "filename": filename,
        "chars_extracted": len(text),
    }
