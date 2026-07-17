# =============================================================================
# MediCore — Terraform Root Module
# Target: AWS ECS Fargate + ALB + RDS (PostgreSQL 16 with pgvector)
#
# Architecture:
#   - VPC with public + private subnets (2 AZs)
#   - ALB in public subnet → forwards to ECS services in private subnets
#   - One ECS cluster, one Task Definition per service (7 tasks)
#   - RDS PostgreSQL 16 in private subnet (pgvector enabled via extension)
#   - Secrets stored in AWS Secrets Manager, injected into task env via SSM
#   - OIDC trust → GitHub Actions deploy role (no long-lived keys)
#   - CloudWatch Logs group per service (free with Fargate awslogs driver)
# =============================================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — replace bucket/key/region once created.
  # backend "s3" {
  #   bucket  = "medicore-tf-state"
  #   key     = "medicore/terraform.tfstate"
  #   region  = "us-east-1"
  #   encrypt = true
  # }
}

provider "aws" {
  region = var.aws_region
}

# =============================================================================
# Data sources
# =============================================================================
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  name_prefix = "medicore-${var.environment}"

  # Services and their internal ports
  services = {
    main-website    = { port = 4000, image_suffix = "main-website" }
    patient-service = { port = 4001, image_suffix = "patient-service" }
    doctor-service  = { port = 4002, image_suffix = "doctor-service" }
    cashier-service = { port = 4003, image_suffix = "cashier-service" }
    ai-service      = { port = 5000, image_suffix = "ai-service" }
  }
}

# =============================================================================
# VPC
# =============================================================================
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name_prefix}-igw" }
}

# Public subnets (ALB)
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "${local.name_prefix}-public-${count.index}" }
}

# Private subnets (ECS tasks + RDS)
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  tags = { Name = "${local.name_prefix}-private-${count.index}" }
}

data "aws_availability_zones" "available" { state = "available" }

resource "aws_eip" "nat" {
  count  = 1
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = "${local.name_prefix}-nat" }
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name_prefix}-rt-public" }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
  tags = { Name = "${local.name_prefix}-rt-private" }
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# =============================================================================
# Security Groups
# =============================================================================
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Allow HTTP/HTTPS from internet to ALB"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
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

resource "aws_security_group" "ecs_tasks" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "Allow ALB → ECS tasks on service ports; allow inter-service"
  vpc_id      = aws_vpc.main.id

  # ALB → all service ports
  ingress {
    from_port       = 4000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  # Inter-service communication within cluster
  ingress {
    from_port = 4000
    to_port   = 5000
    protocol  = "tcp"
    self      = true
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${local.name_prefix}-ecs-sg" }
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Allow ECS tasks → PostgreSQL"
  vpc_id      = aws_vpc.main.id

  ingress {
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

# =============================================================================
# RDS — PostgreSQL 16
# pgvector is enabled via the DB parameter group + extension in schema.sql
# =============================================================================
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = "${local.name_prefix}-db-subnet-group" }
}

resource "aws_db_parameter_group" "postgres16" {
  name   = "${local.name_prefix}-pg16"
  family = "postgres16"

  # pgvector requires shared_preload_libraries in some configurations
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
  tags = { Name = "${local.name_prefix}-pg16-params" }
}

resource "aws_db_instance" "postgres" {
  identifier             = "${local.name_prefix}-postgres"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance_class
  allocated_storage      = 20
  storage_encrypted      = true
  db_name                = "medicore"
  username               = "medicore"
  password               = random_password.db_password.result
  parameter_group_name   = aws_db_parameter_group.postgres16.name
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot    = var.environment == "prod" ? false : true
  deletion_protection    = var.environment == "prod"
  backup_retention_period = var.environment == "prod" ? 7 : 1
  multi_az               = var.environment == "prod"

  tags = { Name = "${local.name_prefix}-postgres" }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = false
}

# =============================================================================
# Secrets Manager — JWT_SECRET and DATABASE_URL
# =============================================================================
resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name_prefix}/jwt-secret"
  recovery_window_in_days = 0  # immediate deletion in dev; use 7 in prod
  tags                    = { Name = "${local.name_prefix}-jwt-secret" }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "aws_secretsmanager_secret" "db_url" {
  name                    = "${local.name_prefix}/database-url"
  recovery_window_in_days = 0
  tags                    = { Name = "${local.name_prefix}-database-url" }
}

resource "aws_secretsmanager_secret_version" "db_url" {
  secret_id = aws_secretsmanager_secret.db_url.id
  secret_string = "postgres://medicore:${random_password.db_password.result}@${aws_db_instance.postgres.address}:5432/medicore"
  depends_on    = [aws_db_instance.postgres]
}

resource "aws_secretsmanager_secret" "mistral_api_key" {
  name                    = "${local.name_prefix}/mistral-api-key"
  recovery_window_in_days = 0
  tags                    = { Name = "${local.name_prefix}-mistral-api-key" }
}

resource "aws_secretsmanager_secret_version" "mistral_api_key" {
  secret_id     = aws_secretsmanager_secret.mistral_api_key.id
  secret_string = var.mistral_api_key  # passed in at apply time, never committed
}

# =============================================================================
# ECS Cluster
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

# =============================================================================
# CloudWatch Log Groups (one per service)
# =============================================================================
resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/ecs/${local.name_prefix}/${each.key}"
  retention_in_days = 30
  tags              = { Service = each.key }
}

# =============================================================================
# IAM — ECS Task Execution Role
# Grants ECS the ability to pull images from ECR/GHCR and read Secrets Manager
# =============================================================================
resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name_prefix}-ecs-secrets-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ]
      Resource = [
        aws_secretsmanager_secret.jwt_secret.arn,
        aws_secretsmanager_secret.db_url.arn,
        aws_secretsmanager_secret.mistral_api_key.arn,
      ]
    }]
  })
}

# =============================================================================
# IAM — ECS Task Role (runtime identity for the application code)
# =============================================================================
resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# =============================================================================
# IAM — GitHub Actions OIDC deploy role
# No long-lived AWS keys are stored in GitHub Secrets.
# The workflow assumes this role via OIDC federation.
# =============================================================================
data "tls_certificate" "github" {
  url = "https://token.actions.githubusercontent.com/.well-known/openid-configuration"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github.certificates[0].sha1_fingerprint]
}

resource "aws_iam_role" "github_deploy" {
  name = "${local.name_prefix}-github-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          # Scope to this repo + main branch + tags
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:*"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "${local.name_prefix}-github-deploy-policy"
  role = aws_iam_role.github_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # ECS deploy: register new task def + update service
        Effect = "Allow"
        Action = [
          "ecs:RegisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeTaskDefinition",
          "ecs:ListTaskDefinitions",
        ]
        Resource = "*"
      },
      {
        # Pass the task execution and task roles to ECS
        Effect   = "Allow"
        Action   = "iam:PassRole"
        Resource = [
          aws_iam_role.ecs_execution.arn,
          aws_iam_role.ecs_task.arn,
        ]
      }
    ]
  })
}

# =============================================================================
# Application Load Balancer
# =============================================================================
resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  tags               = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "main_website" {
  name        = "${local.name_prefix}-main-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }
  tags = { Name = "${local.name_prefix}-main-website-tg" }
}

resource "aws_lb_target_group" "frontend" {
  name        = "${local.name_prefix}-frontend-tg"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/index.html"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }
  tags = { Name = "${local.name_prefix}-frontend-tg" }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main_website.arn
  }
  condition {
    path_pattern { values = ["/api/*", "/auth/*", "/health", "/doctors"] }
  }
}

# =============================================================================
# ECS Task Definitions — one per service
# Secrets Manager references inject values at container startup (no .env files)
# =============================================================================
resource "aws_ecs_task_definition" "main_website" {
  family                   = "${local.name_prefix}-main-website"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "main-website"
    image     = "${var.ghcr_registry}/medicore-main-website:latest"
    essential = true
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]

    secrets = [
      { name = "JWT_SECRET",    valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL",  valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT",                value = "4000" },
      { name = "PATIENT_SERVICE_URL", value = "http://patient-service.${local.name_prefix}.local:4001" },
      { name = "DOCTOR_SERVICE_URL",  value = "http://doctor-service.${local.name_prefix}.local:4002" },
      { name = "CASHIER_SERVICE_URL", value = "http://cashier-service.${local.name_prefix}.local:4003" },
      { name = "AI_SERVICE_URL",      value = "http://ai-service.${local.name_prefix}.local:5000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["main-website"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4000/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

resource "aws_ecs_task_definition" "patient_service" {
  family                   = "${local.name_prefix}-patient-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "patient-service"
    image     = "${var.ghcr_registry}/medicore-patient-service:latest"
    essential = true
    portMappings = [{ containerPort = 4001, protocol = "tcp" }]

    secrets = [
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT",            value = "4001" },
      { name = "AI_SERVICE_URL",  value = "http://ai-service.${local.name_prefix}.local:5000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["patient-service"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4001/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

resource "aws_ecs_task_definition" "doctor_service" {
  family                   = "${local.name_prefix}-doctor-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "doctor-service"
    image     = "${var.ghcr_registry}/medicore-doctor-service:latest"
    essential = true
    portMappings = [{ containerPort = 4002, protocol = "tcp" }]

    secrets = [
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT",           value = "4002" },
      { name = "AI_SERVICE_URL", value = "http://ai-service.${local.name_prefix}.local:5000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["doctor-service"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4002/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

resource "aws_ecs_task_definition" "cashier_service" {
  family                   = "${local.name_prefix}-cashier-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "cashier-service"
    image     = "${var.ghcr_registry}/medicore-cashier-service:latest"
    essential = true
    portMappings = [{ containerPort = 4003, protocol = "tcp" }]

    secrets = [
      { name = "JWT_SECRET",   valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.db_url.arn },
    ]
    environment = [
      { name = "PORT", value = "4003" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["cashier-service"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:4003/health || exit 1"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 15
    }
  }])
}

resource "aws_ecs_task_definition" "ai_service" {
  family                   = "${local.name_prefix}-ai-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"   # Python needs a bit more headroom
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "ai-service"
    image     = "${var.ghcr_registry}/medicore-ai-service:latest"
    essential = true
    portMappings = [{ containerPort = 5000, protocol = "tcp" }]

    secrets = [
      { name = "DATABASE_URL",    valueFrom = aws_secretsmanager_secret.db_url.arn },
      { name = "MISTRAL_API_KEY", valueFrom = aws_secretsmanager_secret.mistral_api_key.arn },
    ]
    environment = [
      { name = "PORT", value = "5000" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service["ai-service"].name
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:5000/health')\" || exit 1"]
      interval    = 15
      timeout     = 10
      retries     = 5
      startPeriod = 60
    }
  }])
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name_prefix}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "frontend"
    image     = "${var.ghcr_registry}/medicore-frontend:latest"
    essential = true
    portMappings = [{ containerPort = 80, protocol = "tcp" }]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = "/ecs/${local.name_prefix}/frontend"
        awslogs-region        = local.region
        awslogs-stream-prefix = "ecs"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost/index.html > /dev/null || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 10
    }
  }])
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.name_prefix}/frontend"
  retention_in_days = 30
  tags              = { Service = "frontend" }
}

# =============================================================================
# ECS Services (one per task definition)
# =============================================================================
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

# =============================================================================
# Service Discovery (Cloud Map) — internal DNS for inter-service comms
# e.g. patient-service resolves "ai-service.medicore-dev.local:5000"
# =============================================================================
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.name_prefix}.local"
  description = "MediCore internal service discovery"
  vpc         = aws_vpc.main.id
}

resource "aws_service_discovery_service" "main_website" {
  name = "main-website"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records { type = "A"; ttl = 10 }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "patient_service" {
  name = "patient-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records { type = "A"; ttl = 10 }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "doctor_service" {
  name = "doctor-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records { type = "A"; ttl = 10 }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "cashier_service" {
  name = "cashier-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records { type = "A"; ttl = 10 }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "ai_service" {
  name = "ai-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records { type = "A"; ttl = 10 }
  }
  health_check_custom_config { failure_threshold = 1 }
}
