# =============================================================================
# terraform/secrets.tf
# AWS Secrets Manager entries for runtime secrets.
#
# Secrets injected into containers at startup (never appear in task def JSON):
#   JWT_SECRET    — random 48-char secret for HS256 JWT signing
#   DATABASE_URL  — full postgres:// connection string (built from RDS address)
#   MISTRAL_API_KEY — Mistral AI API key (passed via -var at apply time)
#
# recovery_window_in_days = 0 for dev environments allows immediate deletion
# when running terraform destroy. In production use 7 (AWS minimum) to
# prevent accidental permanent deletion.
#
# IMPORTANT: MISTRAL_API_KEY must be passed at apply time:
#   terraform apply -var="mistral_api_key=$MISTRAL_API_KEY"
# Or add it to terraform.tfvars (which must be in .gitignore — see example file).
# Never hardcode it or commit it to the repository.
# =============================================================================

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name_prefix}/jwt-secret"
  recovery_window_in_days = 0  # immediate deletion in dev; change to 7 in prod
  tags                    = { Name = "${local.name_prefix}-jwt-secret" }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "aws_secretsmanager_secret" "db_url" {
  name                    = "${local.name_prefix}/database-url"
  recovery_window_in_days = 0
  tags                    = { Name = "${local.name_prefix}-database-url" }
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id = aws_secretsmanager_secret.db_url.id
  # Builds the full postgres:// URI from the RDS instance address.
  # Depends on aws_db_instance.postgres so Terraform waits for RDS to be ready.
  secret_string = "postgres://medicore:${random_password.db_password.result}@${aws_db_instance.postgres.address}:5432/medicore"
  depends_on    = [aws_db_instance.postgres]
}

resource "aws_secretsmanager_secret" "mistral_api_key" {
  name                    = "${local.name_prefix}/mistral-api-key"
  recovery_window_in_days = 0
  tags                    = { Name = "${local.name_prefix}-mistral-api-key" }
}

resource "aws_secretsmanager_secret_version" "mistral_api_key" {
  secret_id     = aws_secretsmanager_secret.mistral_api_key.id
  secret_string = var.mistral_api_key  # sensitive=true — never logged
}
