# =============================================================================
# terraform/cloudwatch.tf
# CloudWatch Log Groups — one per ECS service.
#
# All ECS tasks use the awslogs log driver, which streams container stdout/stderr
# to CloudWatch automatically. No log agent sidecar needed.
#
# Retention: 14 days. Reasoning:
#   - Free tier: CloudWatch Logs storage is $0.03/GB/month after 5 GB/month.
#     At 1 req/s per service × 1 KB/log × 6 services = ~6 GB/month → ~$0.03/day.
#     14 days keeps cost near zero for a demo.
#   - 14 days covers any reasonable incident investigation window.
#   - Production recommendation: 30-90 days for compliance, with log export to
#     S3 for long-term cheap storage.
#
# Log group paths follow the pattern /ecs/medicore-{env}/{service-name}
# so CloudWatch Insights queries can filter by service easily.
# =============================================================================

resource "aws_cloudwatch_log_group" "main_website" {
  name              = "/ecs/${local.name_prefix}/main-website"
  retention_in_days = 14
  tags              = { Service = "main-website" }
}

resource "aws_cloudwatch_log_group" "patient_service" {
  name              = "/ecs/${local.name_prefix}/patient-service"
  retention_in_days = 14
  tags              = { Service = "patient-service" }
}

resource "aws_cloudwatch_log_group" "doctor_service" {
  name              = "/ecs/${local.name_prefix}/doctor-service"
  retention_in_days = 14
  tags              = { Service = "doctor-service" }
}

resource "aws_cloudwatch_log_group" "cashier_service" {
  name              = "/ecs/${local.name_prefix}/cashier-service"
  retention_in_days = 14
  tags              = { Service = "cashier-service" }
}

resource "aws_cloudwatch_log_group" "ai_service" {
  name              = "/ecs/${local.name_prefix}/ai-service"
  retention_in_days = 14
  tags              = { Service = "ai-service" }
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.name_prefix}/frontend"
  retention_in_days = 14
  tags              = { Service = "frontend" }
}
