# =============================================================================
# terraform/alb.tf
# Application Load Balancer, target groups, listener, and routing rules.
#
# Architecture:
#   Internet → ALB (port 80, public subnets)
#   Default action → frontend target group (nginx port 80)
#   Priority rules → main_website target group (Express port 4000) for all
#                    API and auth paths that the gateway owns
#
# Routing rules (exhaustive — covers every path the gateway proxies):
#   Priority 10:  /auth/*              → main-website (login, signup, /me)
#   Priority 20:  /patients/*          → main-website (patient proxy routes)
#   Priority 30:  /doctors/*           → main-website (doctor proxy + public list)
#   Priority 40:  /cashier/*           → main-website (cashier proxy routes)
#   Priority 50:  /ai/*               → main-website (AI chatbot proxy routes)
#   Priority 60:  /health             → main-website (gateway health check)
#   Default:      everything else     → frontend (React app served by nginx)
#
# NOTE: patient-service, doctor-service, cashier-service, and ai-service have
# NO target groups and NO load_balancer blocks in their ECS services.
# They are internal only, reachable via Cloud Map DNS from main-website.
# =============================================================================

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  tags = { Name = "${local.name_prefix}-alb" }
}

# ── Target group: main-website (API gateway on port 4000) ────────────────────
resource "aws_lb_target_group" "main_website" {
  name        = "${local.name_prefix}-main-tg"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"   # required for Fargate awsvpc mode

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

# ── Target group: frontend (nginx on port 80) ─────────────────────────────────
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

# ── HTTP listener — default action forwards to frontend ───────────────────────
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

# ── Listener rules — route API paths to main-website ─────────────────────────
# Each rule is a separate resource so it's easy to add/modify a single path
# without touching the others. Lower priority number = checked first.

resource "aws_lb_listener_rule" "auth" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main_website.arn
  }
  condition {
    path_pattern { values = ["/auth", "/auth/*"] }
  }
}

resource "aws_lb_listener_rule" "patients" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 20
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main_website.arn
  }
  condition {
    path_pattern { values = ["/patients", "/patients/*"] }
  }
}

resource "aws_lb_listener_rule" "doctors" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 30
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main_website.arn
  }
  condition {
    path_pattern { values = ["/doctors", "/doctors/*"] }
  }
}

resource "aws_lb_listener_rule" "cashier" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 40
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main_website.arn
  }
  condition {
    path_pattern { values = ["/cashier", "/cashier/*"] }
  }
}

resource "aws_lb_listener_rule" "ai" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 50
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main_website.arn
  }
  condition {
    # Covers /ai/chat/public, /ai/chat/patient, /ai/ingest/patient/:id
    path_pattern { values = ["/ai", "/ai/*"] }
  }
}

resource "aws_lb_listener_rule" "health" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 60
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main_website.arn
  }
  condition {
    path_pattern { values = ["/health"] }
  }
}
