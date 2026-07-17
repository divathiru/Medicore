# ai-service/seed-docs/

Static hospital knowledge files for the **public RAG corpus**.

## What belongs here

Drop any of the following into this folder and they will be ingested into the
`namespace='public'` embeddings table by the seed ingestion script:

| Extension | Notes |
|-----------|-------|
| `.pdf`    | Scanned or digital PDFs — pdfplumber extracts text layer |
| `.txt`    | Plain text files |
| `.md`     | Markdown files (treated as plain text) |

**Good candidates:**
- Department information pages (Cardiology, Neurology, Paediatrics…)
- Doctor bios / staff directory
- Hospital policies (visiting hours, billing policy, insurance coverage)
- FAQ sheets
- Treatment procedure overviews

## What does NOT belong here
- Patient-specific documents (those go through `POST /ingest/patient/{id}`)
- Images without a text layer (no OCR in this pipeline)
- Files larger than the model context limit — chunk them first

## How ingestion works

These files are **never** processed automatically at startup.  
After dropping new files, run the one-off ingestion script manually:

```bash
# Inside Docker (recommended)
docker compose exec ai-service python scripts/ingest_seed_docs.py

# Locally (with venv active in ai-service/)
python scripts/ingest_seed_docs.py

# Force re-embed files that were already ingested
docker compose exec ai-service python scripts/ingest_seed_docs.py --force
```

Each file's embeddings are tagged with `metadata.source_file = <filename>`.
The script is **idempotent by default** — it skips files already present in
the `public` namespace unless `--force` is passed.

## Namespace
All embeddings from this folder are inserted with `namespace = 'public'`.
They feed the anonymous hospital chatbot (`GET /ai/chat/public`) and are
**never** mixed with patient-specific (`namespace = 'patient'`) data.
