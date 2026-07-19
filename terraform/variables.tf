# =============================================================================
# terraform/variables.tf
# All input variables for the MediCore deployment.
# Sensitive values (mistral_api_key) are never committed — pass them at apply
# time via: terraform apply -var="mistral_api_key=$MISTRAL_API_KEY"
# =============================================================================

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev|staging|prod)"
  type        = string
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod"
  }
}

variable "db_instance_class" {
  description = "RDS instance class. db.t3.micro is Free Tier eligible (dev only)."
  type        = string
  default     = "db.t3.micro"
}

variable "service_desired_count" {
  description = "Desired task count per ECS service. Use 1 for dev, 2+ for prod."
  type        = number
  default     = 1
}

variable "ghcr_registry" {
  description = "GHCR registry prefix, e.g. ghcr.io/your-username"
  type        = string
}

variable "github_repo" {
  description = "GitHub repo slug for OIDC trust, e.g. your-username/medicore"
  type        = string
}

variable "mistral_api_key" {
  description = <<-EOT
    Mistral AI API key — never committed to version control.
    Pass at apply time: terraform apply -var="mistral_api_key=$MISTRAL_API_KEY"
    Or add to terraform.tfvars (which must be gitignored).
  EOT
  type      = string
  sensitive = true
}

variable "ghcr_pat" {
  description = <<-EOT
    GitHub Personal Access Token (classic) for ECS to pull images from GHCR.
    Required scope: read:packages ONLY — do not grant write or repo access.
    Generate at: github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
    Pass at apply time: terraform apply -var="ghcr_pat=$GHCR_PAT"
    Or add to terraform.tfvars (gitignored — never commit this value).

    IMPORTANT: Only needed if any medicore-* GHCR package is Private.
    If all 6 packages are set Public (step 4a), ECS pulls without credentials.
    Keep configured anyway as defense-in-depth for future private packages.
  EOT
  type      = string
  sensitive = true
  default   = ""  # empty default so plan works without it when packages are public
}
