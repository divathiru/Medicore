# =============================================================================
# terraform/ecs_task_definitions.tf
# One Task Definition per service (6 total).
# Secrets Manager references inject secrets at container start — no .env files,
# no plaintext secrets in the task definition JSON.
#
# CPU/memory choices:
#   Node services: 256 CPU / 512 MB  (Express is lightweight)
#   ai-service:    512 CPU / 1024 MB (Python FastAPI + sentence embeddings)
#   frontend:      256 CPU / 512 MB  (static nginx, very low load)
# =============================================================================

# =============================================================================
# main-website — Auth gateway + reverse proxy (port 4000)
#
# What it does:
#   Issues and verifies JWTs, proxies /patients/*, /doctors/*, /cashier/*,
#   /ai/* to the respective downstream services via Cloud Map DNS.
#
# Why it needs these secrets/env vars:
#   JWT_SECRET     — signs and verifies JWTs for all roles
#   DATABASE_URL   — stores auth.users table (login/signup)
#   *_SERVICE_URL  — internal Cloud Map DNS names for downstream services
#
# Called by:  ALB (the only public entry point)
# Calls:      patient-service, doctor-service, cashier-service, ai-service
# =============================================================================
resource "aws_ecs_task_definition" "main_website" {
  family                   = "${local.name_prefix}-main-website"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_default.arn

  container_definitions = jsonencode([{
    name      = "main-website"
    image     = "${var.ghcr_registry}/medicore-main-website:latest"
    essential = true
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]
    # repositoryCredentials: only set when ghcr_pat is provided (private packages).
    # When packages are Public (step 4a), ghcr_pat is empty and this key is omitted.
    repositoryCredentials = var.ghcr_pat != "" ? { credentialsParameter = aws_secretsmanager_secret.ghcr_credentials[0].arn } : null

    secrets = [
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT",                value = "4000" },
      { name = "PATIENT_SERVICE_URL", value = "http://patient-service.${local.name_prefix}.local:4001" },
      { name = "DOCTOR_SERVICE_URL",  value = "http://doctor-service.${local.name_prefix}.local:4002" },
      { name = "CASHIER_SERVICE_URL", value = "http://cashier-service.${local.name_prefix}.local:4003" },
      { name = "AI_SERVICE_URL",      value = "http://ai-service.${local.name_prefix}.local:5000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.main_website.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4000/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

# =============================================================================
# patient-service — Patient profiles, appointment booking, summary upload (port 4001)
#
# What it does:
#   CRUD for patient profiles, appointment booking (with FOR UPDATE lock),
#   and medical summary upload (text extraction + S3 storage + RAG ingestion).
#
# Why it needs these secrets/env vars:
#   JWT_SECRET     — verifies patient JWTs locally (no auth-service round-trip)
#   DATABASE_URL   — patients.patients, patients.old_summaries, appointments.*
#   AI_SERVICE_URL — fire-and-forget POST /ingest/patient/:id after upload
#   S3_BUCKET_NAME — name of the private S3 bucket for patient file uploads
#
# Why it uses patient_service_task_role (not the default):
#   The patient task role has an inline policy granting s3:PutObject/GetObject
#   scoped to arn:aws:s3:::${bucket}/patient-uploads/* — least privilege.
#   No other service has S3 access.
#
# Called by:  main-website (proxy)
# Calls:      PostgreSQL, ai-service (/ingest), S3 (PutObject)
# =============================================================================
resource "aws_ecs_task_definition" "patient_service" {
  family                   = "${local.name_prefix}-patient-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_patient.arn   # S3-enabled role

  container_definitions = jsonencode([{
    name      = "patient-service"
    image     = "${var.ghcr_registry}/medicore-patient-service:latest"
    essential = true
    portMappings = [{ containerPort = 4001, protocol = "tcp" }]
    repositoryCredentials = var.ghcr_pat != "" ? { credentialsParameter = aws_secretsmanager_secret.ghcr_credentials[0].arn } : null

    secrets = [
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT",            value = "4001" },
      { name = "AI_SERVICE_URL",  value = "http://ai-service.${local.name_prefix}.local:5000" },
      { name = "S3_BUCKET_NAME",  value = aws_s3_bucket.patient_uploads.bucket },
      { name = "AWS_REGION",      value = local.region },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.patient_service.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4001/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

# =============================================================================
# doctor-service — Daily appointment queue, patient records, prescriptions (port 4002)
#
# What it does:
#   Doctors view their daily queue, read patient profiles + uploaded summaries
#   (appointment-scoped), write prescriptions, and query the patient RAG chatbot.
#
# Why it needs these secrets/env vars:
#   JWT_SECRET     — verifies doctor JWTs locally
#   DATABASE_URL   — doctors.doctors, appointments.*, patients.old_summaries
#   AI_SERVICE_URL — POST /chat/patient (per-patient RAG query)
#
# Called by:  main-website (proxy)
# Calls:      PostgreSQL, ai-service (/chat/patient)
# =============================================================================
resource "aws_ecs_task_definition" "doctor_service" {
  family                   = "${local.name_prefix}-doctor-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_default.arn

  container_definitions = jsonencode([{
    name      = "doctor-service"
    image     = "${var.ghcr_registry}/medicore-doctor-service:latest"
    essential = true
    portMappings = [{ containerPort = 4002, protocol = "tcp" }]
    repositoryCredentials = var.ghcr_pat != "" ? { credentialsParameter = aws_secretsmanager_secret.ghcr_credentials[0].arn } : null

    secrets = [
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT",           value = "4002" },
      { name = "AI_SERVICE_URL", value = "http://ai-service.${local.name_prefix}.local:5000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.doctor_service.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4002/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

# =============================================================================
# cashier-service — Payment recording, queue position assignment (port 4003)
#
# What it does:
#   Records payment for a booked appointment, assigns queue_position (1-based
#   counter per doctor per day), and exposes the daily paid queue for doctors.
#
# Why it needs these secrets/env vars:
#   JWT_SECRET   — verifies cashier JWTs locally
#   DATABASE_URL — appointments.appointments (updates status + queue_position)
#
# Called by:  main-website (proxy)
# Calls:      PostgreSQL only
# =============================================================================
resource "aws_ecs_task_definition" "cashier_service" {
  family                   = "${local.name_prefix}-cashier-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_default.arn

  container_definitions = jsonencode([{
    name      = "cashier-service"
    image     = "${var.ghcr_registry}/medicore-cashier-service:latest"
    essential = true
    portMappings = [{ containerPort = 4003, protocol = "tcp" }]
    repositoryCredentials = var.ghcr_pat != "" ? { credentialsParameter = aws_secretsmanager_secret.ghcr_credentials[0].arn } : null

    secrets = [
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT", value = "4003" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.cashier_service.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4003/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

# =============================================================================
# ai-service — Dual RAG pipelines using Mistral + pgvector (port 5000)
#
# What it does:
#   1. Public chatbot  (POST /chat/public)  — queries hospital-wide corpus
#   2. Patient chatbot (POST /chat/patient) — queries per-patient embeddings
#   3. Ingest          (POST /ingest/*)     — chunks + embeds text into pgvector
#   All queries go to Mistral's mistral-small API for final answer generation.
#
# Why it needs these secrets/env vars:
#   DATABASE_URL    — public.embeddings table (pgvector cosine similarity)
#   MISTRAL_API_KEY — Mistral LLM API for embedding + completion
#
# Why 512 CPU / 1024 MB:
#   Python + FastAPI startup is heavier than Node. The embedding similarity
#   search and Mistral API calls also need a bit more headroom.
#
# Called by:  main-website (/ai/* proxy), patient-service (ingest), doctor-service (chat)
# Calls:      PostgreSQL (pgvector), Mistral API (external HTTPS)
# =============================================================================
resource "aws_ecs_task_definition" "ai_service" {
  family                   = "${local.name_prefix}-ai-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_default.arn

  container_definitions = jsonencode([{
    name      = "ai-service"
    image     = "${var.ghcr_registry}/medicore-ai-service:latest"
    essential = true
    portMappings = [{ containerPort = 5000, protocol = "tcp" }]
    repositoryCredentials = var.ghcr_pat != "" ? { credentialsParameter = aws_secretsmanager_secret.ghcr_credentials[0].arn } : null

    secrets = [
      # NOTE: ai-service uses a Python-specific DB URL secret (sslmode=require).
      # psycopg v3 uses standard libpq sslmode values — "no-verify" is a Node pg
      # alias and is rejected by psycopg as "invalid sslmode value".
      # Node services use database-url (sslmode=no-verify); Python uses database-url-python (sslmode=require).
      { name = "DATABASE_URL",    valueFrom = aws_secretsmanager_secret.db_url_python.arn },
      { name = "MISTRAL_API_KEY", valueFrom = aws_secretsmanager_secret.mistral_api_key.arn },
    ]
    environment = [
      { name = "PORT", value = "5000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.ai_service.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    # Extended start period — Python FastAPI takes longer to initialise than Node
    healthCheck = {
      command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:5000/health')\" || exit 1"]
      interval    = 15
      timeout     = 10
      retries     = 5
      startPeriod = 60
    }
  }])
}

# =============================================================================
# frontend — React/Vite app served by nginx (port 80)
#
# What it does:
#   Serves the pre-built React SPA. The frontend uses RELATIVE API paths
#   (no hardcoded host). nginx.conf in the container proxies:
#     /auth/*     → main-website.medicore-dev.local:4000
#     /patients/* → main-website.medicore-dev.local:4000
#     /doctors/*  → main-website.medicore-dev.local:4000
#     /cashier/*  → main-website.medicore-dev.local:4000
#     /ai/*       → main-website.medicore-dev.local:4000
#   This means the compiled React bundle works from ANY host/IP/ALB DNS —
#   no VITE_API_BASE_URL baked in at build time.
#
# Why no secrets or VITE_API_BASE_URL:
#   The frontend build intentionally omits VITE_API_BASE_URL so axios uses
#   relative paths. nginx handles routing to main-website via Cloud Map DNS.
#
# Called by:  ALB (default action for all non-API paths)
# Calls:      main-website only (via internal nginx proxy → Cloud Map DNS)
# =============================================================================
resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name_prefix}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_default.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = "${var.ghcr_registry}/medicore-frontend:latest"
    essential = true
    portMappings = [{ containerPort = 80, protocol = "tcp" }]
    repositoryCredentials = var.ghcr_pat != "" ? { credentialsParameter = aws_secretsmanager_secret.ghcr_credentials[0].arn } : null

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.frontend.name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost/index.html > /dev/null || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
  }])
}
