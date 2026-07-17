# MediCore
> End-to-end hospital appointment management platform — 5-day scoped solo build.

[![CI · main-website](https://github.com/YOUR_USERNAME/medicore/actions/workflows/ci-main-website.yml/badge.svg)](https://github.com/YOUR_USERNAME/medicore/actions/workflows/ci-main-website.yml)
[![CI · ai-service](https://github.com/YOUR_USERNAME/medicore/actions/workflows/ci-ai-service.yml/badge.svg)](https://github.com/YOUR_USERNAME/medicore/actions/workflows/ci-ai-service.yml)

---

## Architecture Summary

MediCore is a **microservices monorepo** — one folder per service, single shared `docker-compose.yml`, single Postgres instance with schema-per-service isolation.

```
Browser (port 5173)
    │
    ▼
frontend (nginx, port 80 inside container)
    │
    ▼
main-website (Express gateway, port 4000)  ← single public entry point
    ├── /auth/*         → auth routes (local, no proxy)
    ├── /patients/*     → patient-service  :4001
    ├── /doctors/*      → doctor-service   :4002
    ├── /cashier/*      → cashier-service  :4003
    └── /ai/*           → ai-service       :5000
                                │
                         pgvector / pg16
                         (single Postgres instance,
                          schemas: auth, patients,
                          doctors, appointments,
                          cashier, public.embeddings)
```

### Service Inventory

| Service          | Port     | Tech               | Role                                             |
|------------------|----------|--------------------|--------------------------------------------------|
| `main-website`   | 4000     | Node/Express       | Auth, JWT issue, reverse proxy / API gateway     |
| `patient-service`| 4001     | Node/Express       | Patient profile, appointment booking, file upload|
| `doctor-service` | 4002     | Node/Express       | Daily queue, patient records, prescriptions      |
| `cashier-service`| 4003     | Node/Express       | Payment recording, queue position assignment     |
| `ai-service`     | 5000     | Python/FastAPI     | Dual RAG pipelines (Mistral + pgvector)          |
| `frontend`       | 5173/80  | React/Vite + Nginx | Full patient + doctor workspace UIs              |
| `postgres`       | 5432     | pgvector/pg16      | Shared DB, schema-per-service                    |

### Auth Contract (all services enforce this identically)

- JWT signed with **HS256**, secret from `JWT_SECRET` env var, **8h expiry**
- Payload: `{ sub: <user uuid>, role: 'patient'|'doctor'|'cashier', exp }`
- Every non-public route verifies the JWT **locally** — no inter-service auth calls
- Shared middleware: `src/middleware/requireRole.js` (identical copy in every Node service)

---

## Quick Start — Local (Docker Compose)

### Prerequisites
- Docker ≥ 24 with Docker Compose v2 (`docker compose` not `docker-compose`)
- No Node/Python needed locally — everything runs in containers

### 1. Set up environment

```bash
cp main-website/.env.example .env
# Edit .env and set a strong JWT_SECRET
# MISTRAL_API_KEY is required for ai-service (get one free at console.mistral.ai)
```

The `.env` at the repo root is shared by all services via `env_file: .env`.

### 2. First-time clean boot

```bash
docker compose up --build
```

This will:
1. Pull `pgvector/pgvector:pg16` and create the `medicore` database
2. Run `db/schema.sql` (all schemas + tables) then `db/seed.sql` (doctor/cashier accounts)
3. Build all 6 service images and start them in dependency order
4. Postgres → ai-service/main-website → patient/doctor/cashier → frontend

### 3. Verify all services healthy

```bash
curl -s http://localhost:4000/health  # {"status":"ok"}
curl -s http://localhost:4001/health  # {"status":"ok"}
curl -s http://localhost:4002/health  # {"status":"ok"}
curl -s http://localhost:4003/health  # {"status":"ok"}
curl -s http://localhost:5000/health  # {"status":"ok"}
# Frontend: open http://localhost:5173 in browser
```

### 4. Seed the public RAG corpus (run once)

Drop hospital documents (PDF/TXT/MD) into `ai-service/seed-docs/`, then:

```bash
docker compose exec ai-service python scripts/ingest_seed_docs.py
# Re-run with --force to re-embed files already in the DB
```

### 5. Full clean rebuild (wipe state)

```bash
docker compose down -v && docker compose up --build
```

---

## Demo Credentials

All accounts seeded by `db/seed.sql` on first `docker compose up`.  
Dev password for all seeded accounts: **`devpass123`**

| Role    | Email                          | Notes                      |
|---------|--------------------------------|----------------------------|
| Doctor  | `dr.amelia.chen@medicore.dev`  | Cardiology, 12 years exp.  |
| Doctor  | `dr.raj.patel@medicore.dev`    | Neurology, 8 years exp.    |
| Cashier | `cashier@medicore.dev`         | Front-desk billing staff   |

> **Patient accounts** are self-registered via `POST /auth/signup`.  
> **No admin account** exists — only the three roles above are in scope.

---

## Key API Endpoints (gateway — port 4000)

| Method | Path                                      | Auth            | Description                        |
|--------|-------------------------------------------|-----------------|------------------------------------|
| `GET`  | `/health`                                 | public          | Gateway health                     |
| `GET`  | `/doctors`                                | public          | Doctor listing (marketing page)    |
| `POST` | `/auth/signup`                            | public          | Patient self-registration          |
| `POST` | `/auth/login`                             | public          | Login any role → JWT               |
| `GET`  | `/auth/me`                                | any JWT         | Decode own token claims            |
| `GET`  | `/patients/me`                            | JWT (patient)   | Own profile                        |
| `PUT`  | `/patients/me`                            | JWT (patient)   | Update profile                     |
| `POST` | `/patients/me/summaries`                  | JWT (patient)   | Upload medical summary (multipart) |
| `POST` | `/patients/me/appointments`               | JWT (patient)   | Book appointment                   |
| `GET`  | `/patients/me/appointments`               | JWT (patient)   | Appointment history                |
| `GET`  | `/doctors/me/appointments?date=`          | JWT (doctor)    | Daily queue                        |
| `GET`  | `/doctors/me/patients/:id`                | JWT (doctor)    | Patient record (appointment-scoped)|
| `POST` | `/doctors/me/patients/:id/prescriptions`  | JWT (doctor)    | Write prescription                 |
| `POST` | `/doctors/me/patients/:id/ask`            | JWT (doctor)    | AI chatbot (patient RAG)           |
| `POST` | `/cashier/appointments/:id/pay`           | JWT (cashier)   | Record payment + assign queue pos  |
| `GET`  | `/cashier/appointments`                   | JWT (cashier)   | Today's paid queue                 |
| `POST` | `/ai/chat/public`                         | public          | Public hospital-info chatbot       |
| `POST` | `/ai/chat/patient`                        | JWT (doctor)    | Per-patient RAG chatbot            |
| `POST` | `/ai/ingest/patient/:id`                  | any JWT         | Ingest patient document chunk      |

---

## Running Without Docker (local dev)

```bash
# Each service — run from its directory
cp .env.example .env      # edit DATABASE_URL to point at localhost:5432
npm install
npm run dev               # nodemon auto-reload

# ai-service
cd ai-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 5000
```

---

## CI/CD — GitHub Actions

Each service has its own workflow in `.github/workflows/`:

| Workflow                    | Trigger                    | Jobs                                     |
|-----------------------------|----------------------------|------------------------------------------|
| `ci-main-website.yml`       | push/PR to `main-website/` | lint → smoke `/health` → Docker → GHCR  |
| `ci-patient-service.yml`    | push/PR to `patient-service/` | same pattern                          |
| `ci-doctor-service.yml`     | push/PR to `doctor-service/`  | same pattern                          |
| `ci-cashier-service.yml`    | push/PR to `cashier-service/` | same pattern                          |
| `ci-ai-service.yml`         | push/PR to `ai-service/`   | lint (ruff) → smoke → Docker → GHCR     |
| `ci-frontend.yml`           | push/PR to `frontend/`     | lint → Vite build → Docker → GHCR       |
| `deploy-ecs.yml`            | after CI passes on `main`  | OIDC assume-role → register task def → update ECS service |

**No long-lived AWS keys are stored in GitHub Secrets.** The deploy workflow uses OIDC federation to assume the `medicore-dev-github-deploy` IAM role provisioned by Terraform.

---

## Deployment — AWS ECS Fargate

Infrastructure is in `terraform/`. One Task Definition per service, one ECS Cluster.

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — set ghcr_registry, github_repo, etc.

terraform init
terraform plan -var="mistral_api_key=$MISTRAL_API_KEY"
terraform apply -var="mistral_api_key=$MISTRAL_API_KEY"

# After apply, grab the deploy role ARN and set it as a GitHub variable:
terraform output github_deploy_role_arn
```

Architecture provisioned:
- **VPC** with public (ALB) + private (ECS + RDS) subnets across 2 AZs
- **ALB** routing `/api/*, /auth/*` → main-website, everything else → frontend
- **ECS Fargate** — one task definition per service, Cloud Map private DNS for inter-service comms
- **RDS PostgreSQL 16** in private subnet (pgvector extension enabled via schema.sql)
- **AWS Secrets Manager** — `JWT_SECRET`, `DATABASE_URL`, `MISTRAL_API_KEY` injected at container start; never in env vars or task definition JSON
- **CloudWatch Logs** — every ECS task uses the `awslogs` log driver; logs appear in `/ecs/medicore-dev/<service-name>`
- **GitHub OIDC deploy role** — scoped to your repo, allows only `ecs:RegisterTaskDefinition`, `ecs:UpdateService`, and `iam:PassRole` for the two ECS roles

---

## v2 / Explicitly Descoped

The following were **deliberately excluded** from this 5-day build. They appear in the original architecture proposal as v2 goals and are listed here so a reviewer understands these are scope decisions, not gaps:

| Feature                     | Reason descoped                                                       |
|-----------------------------|-----------------------------------------------------------------------|
| `admin-service`             | Requires additional role + GUI for managing doctor/cashier accounts — v2 |
| `analytics-service`         | Strategist dashboard with Recharts — v2                               |
| `admin` / `strategist` roles| No routes, no JWT payload values, no DB rows for these roles exist    |
| True DB-per-service split   | Single Postgres with schema separation is the correct scoped choice; separate RDS instances would add cost and operational complexity without benefit at this scale |
| MCP appointment booking     | Async/agentic flow — v2                                               |
| Google Calendar sync        | OAuth scope + webhook plumbing — v2                                   |
| Kubernetes / Minikube       | ECS Fargate is the stated deployment target for this build            |

---

## Known Simplifications

The following are deliberate engineering trade-offs made to fit the 5-day scope, not oversights:

- **No retry queue on ai-service ingestion.** When a patient uploads a summary, the doctor-service and patient-service fire-and-forget a `POST /ingest/patient/:id` call. If ai-service is temporarily down, the chunk is lost. A production system would use an SQS queue as a buffer.
- **In-memory rate limiting.** The gateway uses `express-rate-limit` with the default in-memory store, which does not share state across multiple instances. A Redis-backed store (e.g. `rate-limit-redis`) is the production solution.
- **No refresh tokens.** JWT is a simple 8h access token with no refresh mechanism. A production auth system would issue short-lived access tokens + long-lived refresh tokens stored server-side.
- **Single NAT Gateway.** The Terraform config uses one NAT Gateway for cost reasons (dev). Production should use one NAT per AZ for availability.
- **No HTTPS / TLS.** The ALB listener is HTTP only. Production requires an ACM certificate + HTTPS listener + HTTP→HTTPS redirect.
- **Uploads on a single volume.** Patient summary uploads go to a Docker named volume (`uploads_data`). In ECS, this must be replaced with an S3 bucket.
- **No pgvector HNSW index.** The embeddings table uses IVFFlat-style cosine similarity via `<=>`. For large corpora, an HNSW index (`CREATE INDEX ... USING hnsw`) gives much better recall/latency. Left as a v2 optimisation.

---

## Day-by-Day Build Log

| Day | Delivered                                                                                        |
|-----|--------------------------------------------------------------------------------------------------|
| 1   | DB schema + seed data, main-website auth + JWT + gateway skeleton, docker-compose base           |
| 2   | patient-service, doctor-service, cashier-service — all routes, RBAC, zod validation             |
| 3   | React/Vite frontend — public marketing page, login/signup, auth context                          |
| 4   | Patient workspace (book appointment, upload summaries) + Doctor workspace (queue, prescriptions) |
| 5   | ai-service (FastAPI, dual RAG pipelines, Mistral, prompt-injection defense), CI/CD, Terraform    |
