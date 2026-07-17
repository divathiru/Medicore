# =============================================================================
# MediCore Terraform — Outputs
# =============================================================================

output "alb_dns_name" {
  description = "Public DNS of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_url" {
  description = "Public URL of the MediCore frontend"
  value       = "http://${aws_lb.main.dns_name}"
}

output "api_url" {
  description = "Public API gateway URL"
  value       = "http://${aws_lb.main.dns_name}"
}

output "ecs_cluster_name" {
  description = "ECS Cluster name"
  value       = aws_ecs_cluster.main.name
}

output "rds_endpoint" {
  description = "RDS endpoint (private, accessible from ECS tasks only)"
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "github_deploy_role_arn" {
  description = "ARN of the GitHub Actions OIDC deploy role — add this to GitHub repo settings as AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}

output "cloudwatch_log_groups" {
  description = "CloudWatch log group names per service"
  value = {
    for svc, lg in aws_cloudwatch_log_group.service :
    svc => lg.name
  }
}

output "service_discovery_namespace" {
  description = "Cloud Map private DNS namespace"
  value       = "${local.name_prefix}.local"
}
