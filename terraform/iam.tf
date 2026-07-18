# =============================================================================
# terraform/iam.tf
# IAM roles and policies for ECS.
#
# Roles:
#   ecs_execution          — allows ECS agent to pull images + read Secrets Manager
#   ecs_task_default       — runtime identity for doctor, cashier, ai, main-website,
#                            frontend (no extra permissions beyond base trust)
#   ecs_task_patient       — runtime identity for patient-service ONLY
#                            grants s3:PutObject + s3:GetObject scoped to
#                            patient-uploads/* in the uploads bucket
#
# Least-privilege design: patient-service is the only service that touches S3.
# Giving the default task role S3 access would violate least privilege and
# expose the bucket to any compromised service.
# =============================================================================

# ── ECS Task Execution Role ───────────────────────────────────────────────────
# Used by the ECS AGENT (not the application). Grants:
#   - ecr:GetAuthorizationToken etc (from managed policy) — image pull
#   - secretsmanager:GetSecretValue — inject secrets at container start
resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name_prefix}-ecs-secrets-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret",
      ]
      Resource = [
        aws_secretsmanager_secret.jwt_secret.arn,
        aws_secretsmanager_secret.db_url.arn,
        aws_secretsmanager_secret.mistral_api_key.arn,
      ]
    }]
  })
}

# ── Default ECS Task Role (runtime identity for most services) ─────────────────
# doctor-service, cashier-service, ai-service, main-website, frontend use this.
# No extra permissions — the base trust is all they need.
resource "aws_iam_role" "ecs_task_default" {
  name = "${local.name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# ── Patient Service Task Role (S3-enabled) ────────────────────────────────────
# patient-service ONLY. Grants PutObject + GetObject scoped to
# patient-uploads/* in the uploads bucket. Nothing broader.
resource "aws_iam_role" "ecs_task_patient" {
  name = "${local.name_prefix}-ecs-task-patient-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_patient_s3" {
  name = "${local.name_prefix}-patient-s3-policy"
  role = aws_iam_role.ecs_task_patient.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
      ]
      # Scoped to patient-uploads/ prefix only — least privilege
      Resource = "${aws_s3_bucket.patient_uploads.arn}/patient-uploads/*"
    }]
  })
}
