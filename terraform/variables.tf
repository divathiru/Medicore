# =============================================================================
# MediCore Terraform — Variables
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
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "service_desired_count" {
  description = "Desired task count per ECS service"
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
  description = "Mistral AI API key — injected at apply time, never committed"
  type        = string
  sensitive   = true
}
