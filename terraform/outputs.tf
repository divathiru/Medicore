# =============================================================================
# terraform/outputs.tf
# Outputs needed after terraform apply:
#
#   alb_dns_name          — paste into browser for the live app
#   ecs_cluster_name      — set as GitHub repo variable ECS_CLUSTER
#   s3_bucket_name        — confirm the bucket name matches patient-service config
#   github_deploy_role_arn — CRITICAL: paste this into GitHub repo →
#                            Settings → Variables → Actions → AWS_DEPLOY_ROLE
#                            before the first CI/CD deploy can succeed
# =============================================================================

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer. Use this as the base URL: http://<alb_dns_name>"
  value       = aws_lb.main.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name. Set this as GitHub repo variable: ECS_CLUSTER"
  value       = aws_ecs_cluster.main.name
}

output "s3_bucket_name" {
  description = "S3 bucket name for patient uploads. Confirm this matches S3_BUCKET_NAME in patient-service config."
  value       = aws_s3_bucket.patient_uploads.bucket
}

output "github_deploy_role_arn" {
  description = <<-EOT
    ARN of the GitHub Actions OIDC deploy role.
    After terraform apply, paste this value into:
      GitHub repo → Settings → Variables → Actions → AWS_DEPLOY_ROLE
    This enables the deploy workflow to assume the role via OIDC (no static keys).
  EOT
  value = aws_iam_role.github_deploy.arn
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (for reference only — never expose publicly)"
  value       = aws_db_instance.postgres.address
  sensitive   = false  # hostname only, no credentials
}
