# =============================================================================
# terraform/s3.tf
# S3 bucket for patient medical summary uploads.
#
# Security posture:
#   - All public access is blocked (BlockPublicAcls, IgnorePublicAcls,
#     BlockPublicPolicy, RestrictPublicBuckets)
#   - Default encryption: SSE-S3 (AES-256). KMS is not used — it adds cost
#     and operational complexity (key rotation, cross-account access) that
#     isn't justified for a demo. Note this for any compliance review.
#   - Versioning: OFF. Files are patient uploads keyed by UUID — there's no
#     meaningful version history for a medical summary. Versioning ON doubles
#     storage cost. This is a deliberate simplification (noted in README).
#   - Lifecycle: no transition rules — storage cost is negligible at demo scale.
#
# Key naming convention (set by patient-service application code):
#   patient-uploads/{patient_uuid}/{uuid}-{original_filename}
#
# Access pattern:
#   - WRITE: patient-service task role (s3:PutObject on patient-uploads/*)
#   - READ:  patient-service task role (s3:GetObject on patient-uploads/*)
#   - No other ECS service or IAM role has any S3 permissions.
#
# Presigned URLs: generating presigned GET URLs for the frontend to display
# uploaded files is out of scope for this build — noted in README Known
# Simplifications. The groundwork is here (bucket + task role); the server-side
# presigned URL endpoint is a v2 feature.
# =============================================================================

resource "aws_s3_bucket" "patient_uploads" {
  # Bucket name uses a random suffix to guarantee global uniqueness.
  # The actual name is exported via outputs.tf and passed to patient-service
  # as the S3_BUCKET_NAME env var in the task definition.
  bucket = "${local.name_prefix}-patient-uploads"

  tags = { Name = "${local.name_prefix}-patient-uploads" }
}

# Block all public access — bucket is private at all times
resource "aws_s3_bucket_public_access_block" "patient_uploads" {
  bucket = aws_s3_bucket.patient_uploads.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# Default encryption: SSE-S3 (AES-256). No KMS for this demo — see note above.
resource "aws_s3_bucket_server_side_encryption_configuration" "patient_uploads" {
  bucket = aws_s3_bucket.patient_uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning OFF (deliberate simplification — see header comment)
resource "aws_s3_bucket_versioning" "patient_uploads" {
  bucket = aws_s3_bucket.patient_uploads.id
  versioning_configuration {
    status = "Suspended"
  }
}
