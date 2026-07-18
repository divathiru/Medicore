# =============================================================================
# terraform/github_oidc.tf
# GitHub Actions OIDC federation for keyless AWS deploys.
#
# How it works:
#   1. GitHub Actions generates a short-lived OIDC token for the workflow run
#   2. The workflow calls sts:AssumeRoleWithWebIdentity with that token
#   3. AWS validates the token against the GitHub OIDC issuer thumbprint
#   4. AWS returns temporary credentials scoped to this role's permissions
#
# No long-lived AWS access keys are stored in GitHub Secrets.
#
# Trust policy is scoped to:
#   - The specific repo (var.github_repo = "your-username/medicore")
#   - Any branch/tag/PR in that repo (sub = "repo:...:*")
#   For tighter control, change "*" to "ref:refs/heads/main" to restrict
#   deploys to the main branch only.
#
# Permissions are the minimum needed for ECS deploys:
#   ecs:UpdateService           — trigger rolling deploy
#   ecs:DescribeServices        — wait-for-stability check
#   ecs:RegisterTaskDefinition  — register the new task def revision
#   ecs:DescribeTaskDefinition  — read the current task def before modifying
#   ecs:ListTaskDefinitions     — used by amazon-ecs-deploy-task-definition action
#   iam:PassRole                — pass the execution + task roles to ECS
#                                 (scoped to exactly the roles ECS needs)
#
# After terraform apply, paste the github_deploy_role_arn output value into
# your GitHub repo → Settings → Variables → Actions → AWS_DEPLOY_ROLE.
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
          # Scoped to this repo — change * to ref:refs/heads/main for prod
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
        Sid    = "ECSDeployPermissions"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:RegisterTaskDefinition",
          "ecs:DescribeTaskDefinition",
          "ecs:ListTaskDefinitions",
        ]
        Resource = "*"   # ECS RegisterTaskDefinition requires * (no resource-level perms)
      },
      {
        Sid    = "PassRoleToECS"
        Effect = "Allow"
        Action = "iam:PassRole"
        # Scoped to exactly the two task roles + execution role needed by ECS
        Resource = [
          aws_iam_role.ecs_execution.arn,
          aws_iam_role.ecs_task_default.arn,
          aws_iam_role.ecs_task_patient.arn,  # needed for patient-service deploy
        ]
      }
    ]
  })
}
