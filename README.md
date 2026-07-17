# MediCore
> End-to-end hospital appointment management platform — 5-day scoped solo build.
---
## Service Architecture
| Service | Port | Tech | Status |
|---|---|---|---|
| `main-website` | 4000 | Node/Express | ✅ Day 1 |
| `patient-service` | 4001 | Node/Express | 🔲 Day 2 |
| `doctor-service` | 4002 | Node/Express | 🔲 Day 2 |
| `cashier-service` | 4003 | Node/Express | 🔲 Day 2 |
| `ai-service` | 5000 | Python/FastAPI | 🔲 Day 5 |
| `frontend` | 5173/80 | React/Vite + Nginx | 🔲 Day 3 |
| `postgres` | 5432 | pgvector/pg16 | ✅ Day 1 |
> **Descoped (v2 roadmap):** `admin-service` and `analytics-service` are explicitly out of scope for this 5-day build. They appear in the original architecture doc as v2 goals — no `admin` or `strategist` role exists anywhere in the current codebase. See §8 of `MediCore_Technical_Architecture_and_Build_Guide.md` for the full stretch-goal list.
---
## Quick Start (Local — Docker Compose)
### Prerequisites
- Docker ≥ 24 with Docker Compose v2
- No need to install Node/Python locally — everything runs in containers
### 1. Create root `.env`
```bash
cp main-website/.env.example .env
# Edit .env and set a strong JWT_SECRET before running
```
The `.env` file at the repo root is read by `docker-compose.yml` via `env_file: .env`.
### 2. Start the stack
```bash
docker compose up --build
```
This will:
1. Pull `pgvector/pgvector:pg16` and create the `medicore` database
2. Run `db/schema.sql` (all schemas + tables) then `db/seed.sql` (doctor/cashier accounts)
3. Build and start `main-website` on port 4000
### 3. Verify everything is healthy
```bash
curl http://localhost:4000/health
# → {"status":"ok"}
```
### 4. Seed the public RAG corpus (run once, or after adding files)
Drop hospital documents (PDF/TXT/MD) into `ai-service/seed-docs/`, then run:
```bash
# Inside Docker (recommended)
docker compose exec ai-service python scripts/ingest_seed_docs.py

# With --force to re-embed files already in the DB
docker compose exec ai-service python scripts/ingest_seed_docs.py --force

# Locally (venv active inside ai-service/)
python scripts/ingest_seed_docs.py
```
The script is **idempotent by default** — it skips files already present in the
`public` namespace unless `--force` is passed. Re-run it any time new files
are dropped into `seed-docs/`.
---
## Seed Accounts (Demo Credentials)
These accounts are inserted by `db/seed.sql` on first `docker compose up`.  
All use the dev password: **`devpass123`**
| Role | Email | Notes |
|---|---|---|
| Doctor | `dr.amelia.chen@medicore.dev` | Cardiology, 12 years exp. |
| Doctor | `dr.raj.patel@medicore.dev` | Neurology, 8 years exp. |
| Cashier | `cashier@medicore.dev` | Front-desk billing staff |
> **Patient accounts** are self-registered via `POST /auth/signup`.  
> **No admin account** exists — doctors and cashier are seeded directly as per the scoped build plan.
---
## Key API Endpoints (main-website, port 4000)
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | public | Service health check |
| `POST` | `/auth/signup` | public | Patient self-registration |
| `POST` | `/auth/login` | public | Login (any role), returns JWT |
| `GET` | `/auth/me` | JWT | Decode own token claims |
| `ANY` | `/patients/*` | JWT (patient) | Proxied to patient-service (Day 2) |
| `ANY` | `/doctors/*` | JWT (doctor) | Proxied to doctor-service (Day 2) |
| `ANY` | `/cashier/*` | JWT (cashier) | Proxied to cashier-service (Day 2) |
| `ANY` | `/ai/*` | JWT / public | Proxied to ai-service (Day 5) |
### Auth Contract
- JWT signed with HS256, 8h expiry
- Payload: `{ sub: <uuid>, role: 'patient'|'doctor'|'cashier', exp }`
- Pass as: `Authorization: Bearer <token>`
---
## Development (Without Docker)
```bash
# In main-website/
cp .env.example .env   # edit DATABASE_URL to point at localhost:5432
npm install
npm run dev            # nodemon auto-reload on port 4000
```
---
## Day-by-Day Build Plan
| Day | Target |
|---|---|
| 1 | ✅ DB schema, seed data, main-website (auth + gateway), docker-compose skeleton |
| 2 | patient-service, doctor-service, cashier-service |
| 3 | Frontend public site + auth UI (React/Vite) |
| 4 | Patient workspace + Doctor workspace UI, wired to real APIs |
| 5 | ai-service: RAG pipelines, doctor /ask endpoint, chat widgets |
---
## v2 / Stretch Goals (post-submission)
- `admin-service` — GUI for managing doctor/cashier accounts
- `analytics-service` + strategist dashboard (Recharts)
- MCP-based appointment booking
- Google Calendar sync
- Kubernetes manifests + Minikube demo
- AWS ECS Fargate deploy via Terraform + GitHub Actions OIDC