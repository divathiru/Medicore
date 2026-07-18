# =============================================================================
# terraform/security_groups.tf
# Three security groups implementing the network boundary for MediCore.
#
# alb_sg       — public internet → ALB on port 80 only
# ecs_tasks_sg — ALB → ECS on ports 4000+80 (main-website, frontend)
#                self-referencing rule allows inter-service calls on 4001-5000
#                (patient, doctor, cashier, ai-service — called only by gateway)
# rds_sg       — ECS tasks → PostgreSQL on 5432 (private, no direct internet)
# =============================================================================

# ── ALB Security Group ────────────────────────────────────────────────────────
# Only inbound HTTP from the internet. HTTPS is out of scope for this demo
# (noted in README Known Simplifications). Egress to anywhere so ALB can reach
# the ECS tasks in private subnets.
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Allow HTTP from internet to ALB only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-alb-sg" }
}

# ── ECS Tasks Security Group ──────────────────────────────────────────────────
# Two ingress rules:
#   1. ALB → main-website (4000) and frontend (80) — ALB is the only public entry
#   2. Self → self on 4001-5000 — lets main-website call patient/doctor/cashier/ai
#      via Cloud Map DNS without leaving the security group boundary
resource "aws_security_group" "ecs_tasks" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "ALB to ECS tasks; inter-service on 4001-5000"
  vpc_id      = aws_vpc.main.id

  # ALB → main-website (4000) and frontend nginx (80)
  ingress {
    description     = "ALB to main-website"
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description     = "ALB to frontend nginx"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Inter-service: main-website → patient(4001), doctor(4002), cashier(4003), ai(5000)
  # Also: patient-service and doctor-service → ai-service(5000) for direct ingest calls
  ingress {
    description = "Inter-service calls within ECS tasks"
    from_port   = 4001
    to_port     = 5000
    protocol    = "tcp"
    self        = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-ecs-sg" }
}

# ── RDS Security Group ────────────────────────────────────────────────────────
# PostgreSQL is reachable only from ECS tasks, never from the internet.
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "PostgreSQL access from ECS tasks only"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from ECS tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${local.name_prefix}-rds-sg" }
}
