# =============================================================================
# terraform/ecs_cluster.tf
# ECS cluster with FARGATE capacity provider.
#
# FARGATE_SPOT is registered as an option but not set as the default —
# Spot can reclaim tasks mid-request which is undesirable for a synchronous
# API. Use FARGATE_SPOT only for batch/background workloads.
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = { Name = "${local.name_prefix}-cluster" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}
