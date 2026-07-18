# =============================================================================
# terraform/versions.tf
# Pins the Terraform core version and all required providers.
#
# Providers used:
#   aws    — all ECS, ALB, RDS, IAM, S3, Secrets Manager, CloudWatch resources
#   random — generate DB password and JWT secret at apply time (no manual input)
#   tls    — fetch the GitHub OIDC thumbprint for the OpenID Connect provider
# =============================================================================

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Uncomment and configure remote state once you have the S3 bucket + DynamoDB
  # table created (run locally once without a backend, then migrate).
  # backend "s3" {
  #   bucket         = "medicore-tf-state"
  #   key            = "medicore/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "medicore-tf-locks"
  # }
}
