# =============================================================================
# terraform/service_discovery.tf
# AWS Cloud Map private DNS namespace + one service registration per backend.
#
# This gives main-website stable internal hostnames like:
#   http://patient-service.medicore-dev.local:4001
#   http://doctor-service.medicore-dev.local:4002
#   http://cashier-service.medicore-dev.local:4003
#   http://ai-service.medicore-dev.local:5000
#
# These names match the *_SERVICE_URL env vars set in ecs_task_definitions.tf.
# ECS automatically registers/deregisters task IPs with Cloud Map as tasks
# start and stop.
#
# main-website is also registered so other services could discover it by name
# if needed (currently not used — the gateway is only called from the ALB).
# =============================================================================

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.name_prefix}.local"
  description = "MediCore internal service discovery namespace"
  vpc         = aws_vpc.main.id
}

resource "aws_service_discovery_service" "main_website" {
  name = "main-website"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "patient_service" {
  name = "patient-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "doctor_service" {
  name = "doctor-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "cashier_service" {
  name = "cashier-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
  health_check_custom_config { failure_threshold = 1 }
}

resource "aws_service_discovery_service" "ai_service" {
  name = "ai-service"
  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"
    dns_records {
      type = "A"
      ttl  = 10
    }
  }
  health_check_custom_config { failure_threshold = 1 }
}
