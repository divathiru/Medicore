# =============================================================================
# terraform/providers.tf
# Configures the AWS provider. Region comes from var.aws_region so a single
# tfvars change retargets the whole deployment.
# =============================================================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "medicore"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ── Data sources used across multiple files ───────────────────────────────────
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_availability_zones" "available" { state = "available" }

# ── Common locals used across all files ───────────────────────────────────────
locals {
  account_id  = data.aws_caller_identity.current.account_id
  region      = data.aws_region.current.name
  name_prefix = "medicore-${var.environment}"
}
