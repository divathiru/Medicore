# =============================================================================
# terraform/rds.tf
# RDS PostgreSQL instance for MediCore.
#
# pgvector: The pgvector extension is enabled by the application schema
# (db/schema.sql runs CREATE EXTENSION IF NOT EXISTS vector). AWS RDS supports
# pgvector starting with PostgreSQL 15.2 and 14.7. We use engine_version = "16"
# which fully supports pgvector.
#
# VERIFY AT APPLY TIME: Run this to confirm your target region supports pg16:
#   aws rds describe-db-engine-versions \
#     --engine postgres \
#     --engine-version 16 \
#     --query 'DBEngineVersions[*].{Version:EngineVersion,Status:Status}'
#
# HA NOTE: multi_az = false for this demo (cost tradeoff). RDS Multi-AZ doubles
# the instance cost but provides automatic failover in ~60-120 seconds if the
# primary AZ fails. Enable multi_az = true for any production workload.
#
# STORAGE: 20 GB gp2 is the Free Tier minimum. pgvector embeddings are stored
# in the public.embeddings table — monitor storage and increase allocated_storage
# as the corpus grows.
# =============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.name_prefix}-db-subnet-group" }
}

resource "aws_db_parameter_group" "postgres16" {
  name   = "${local.name_prefix}-pg16"
  family = "postgres16"

  # pg_stat_statements is loaded for query performance monitoring.
  # pgvector does NOT require shared_preload_libraries — the extension is
  # activated purely via CREATE EXTENSION in the schema SQL.
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  tags = { Name = "${local.name_prefix}-pg16-params" }
}

resource "aws_db_instance" "postgres" {
  identifier             = "${local.name_prefix}-postgres"
  engine                 = "postgres"
  engine_version         = "16"        # pgvector supported from pg14.7+, pg15.2+, pg16+
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  storage_encrypted      = true
  db_name                = "medicore"
  username               = "medicore"
  password               = random_password.db_password.result
  parameter_group_name   = aws_db_parameter_group.postgres16.name
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  # Single-AZ for demo (see HA NOTE above)
  multi_az = false

  # Final snapshot only in prod — skipping in dev avoids snapshot accumulation
  skip_final_snapshot     = var.environment != "prod"
  deletion_protection     = var.environment == "prod"
  backup_retention_period = var.environment == "prod" ? 7 : 1

  tags = { Name = "${local.name_prefix}-postgres" }
}

# Random passwords — generated once at first apply, stored in Terraform state.
# For prod: use a remote backend (S3 + DynamoDB) so state is never lost.
resource "random_password" "db_password" {
  length  = 32
  special = false  # avoid special chars that confuse postgresql URI parsers
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}
