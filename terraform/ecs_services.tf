# =============================================================================
# terraform/ecs_services.tf
# One ECS Service per task definition (6 total).
#
# CRITICAL: Only main-website and frontend have load_balancer blocks.
# patient-service, doctor-service, cashier-service, and ai-service have NO
# load_balancer block — they are reached only via Cloud Map DNS from
# main-website. The ALB never forwards directly to them. This is what keeps
# them non-public even though they share the same VPC/security group.
# =============================================================================

# ── main-website — public entry point via ALB ─────────────────────────────────
resource "aws_ecs_service" "main_website" {
  name            = "${local.name_prefix}-main-website"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main_website.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main_website.arn
    container_name   = "main-website"
    container_port   = 4000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.main_website.arn
  }

  lifecycle {
    ignore_changes = [task_definition]  # managed by CI/CD deploys
  }

  depends_on = [aws_lb_listener.http]
}

# ── patient-service — internal only, no load_balancer block ───────────────────
resource "aws_ecs_service" "patient_service" {
  name            = "${local.name_prefix}-patient-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.patient_service.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.patient_service.arn
  }

  lifecycle { ignore_changes = [task_definition] }
}

# ── doctor-service — internal only, no load_balancer block ────────────────────
resource "aws_ecs_service" "doctor_service" {
  name            = "${local.name_prefix}-doctor-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.doctor_service.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.doctor_service.arn
  }

  lifecycle { ignore_changes = [task_definition] }
}

# ── cashier-service — internal only, no load_balancer block ───────────────────
resource "aws_ecs_service" "cashier_service" {
  name            = "${local.name_prefix}-cashier-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.cashier_service.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.cashier_service.arn
  }

  lifecycle { ignore_changes = [task_definition] }
}

# ── ai-service — internal only, no load_balancer block ────────────────────────
resource "aws_ecs_service" "ai_service" {
  name            = "${local.name_prefix}-ai-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.ai_service.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.ai_service.arn
  }

  lifecycle { ignore_changes = [task_definition] }
}

# ── frontend — public entry point via ALB (default action) ────────────────────
resource "aws_ecs_service" "frontend" {
  name            = "${local.name_prefix}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 80
  }

  lifecycle { ignore_changes = [task_definition] }

  depends_on = [aws_lb_listener.http]
}
