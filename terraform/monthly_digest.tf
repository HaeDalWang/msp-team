variable "enable_monthly_digest" {
  type    = bool
  default = false
}

variable "monthly_digest_image_uri" {
  description = "ECR image URI pinned to sha256 digest. Empty prepares the image repository first."
  type        = string
  default     = ""
  validation {
    condition     = var.monthly_digest_image_uri == "" || can(regex("^[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/.+@sha256:[a-f0-9]{64}$", var.monthly_digest_image_uri))
    error_message = "Use an ECR image URI with @sha256: digest."
  }
}

variable "monthly_digest_site_origin" {
  description = "MSP origin allowed to upload PDF files, e.g. https://msp.example.com"
  type        = string
  default     = ""
  validation {
    condition     = var.monthly_digest_site_origin == "" || can(regex("^https://[a-zA-Z0-9.-]+(:[0-9]+)?$", var.monthly_digest_site_origin))
    error_message = "Use the site's HTTPS origin without a trailing slash."
  }
}

variable "monthly_digest_model_id" {
  type    = string
  default = "global.anthropic.claude-sonnet-5"
  validation {
    condition     = can(regex("^(global|apac|us|eu)\\.anthropic\\.[a-z0-9:.-]+$", var.monthly_digest_model_id))
    error_message = "Use an Anthropic cross-region inference profile ID."
  }
}

variable "monthly_digest_slack_secret_arn" {
  description = "Optional existing Secrets Manager secret with SLACK_BOT_TOKEN and SLACK_CHANNEL_ID. Secret values are not Terraform inputs."
  type        = string
  default     = ""
}

locals {
  digest_name       = "${var.project_name}-monthly-digest"
  digest_ready      = var.enable_monthly_digest && var.monthly_digest_image_uri != ""
  digest_model_name = replace(var.monthly_digest_model_id, "/^(global|apac|us|eu)\\./", "")
}

resource "aws_ecr_repository" "monthly_digest" {
  count                = var.enable_monthly_digest ? 1 : 0
  name                 = local.digest_name
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_repository_policy" "monthly_digest" {
  count      = var.enable_monthly_digest ? 1 : 0
  repository = aws_ecr_repository.monthly_digest[0].name
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Sid       = "LambdaImageRetrieval", Effect = "Allow",
    Principal = { Service = "lambda.amazonaws.com" },
    Action    = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"],
    Condition = { ArnLike = { "aws:SourceArn" = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${local.digest_name}" } }
  }] })
}

resource "aws_s3_bucket" "monthly_digest" {
  count  = var.enable_monthly_digest ? 1 : 0
  bucket = "${local.digest_name}-${data.aws_caller_identity.current.account_id}"
  lifecycle {
    precondition {
      condition     = var.monthly_digest_site_origin != ""
      error_message = "Set monthly_digest_site_origin before enabling monthly reports."
    }
  }
}

resource "aws_s3_bucket_public_access_block" "monthly_digest" {
  count                   = var.enable_monthly_digest ? 1 : 0
  bucket                  = aws_s3_bucket.monthly_digest[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "monthly_digest" {
  count  = var.enable_monthly_digest ? 1 : 0
  bucket = aws_s3_bucket.monthly_digest[0].id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_cors_configuration" "monthly_digest" {
  count  = var.enable_monthly_digest ? 1 : 0
  bucket = aws_s3_bucket.monthly_digest[0].id
  cors_rule {
    allowed_origins = [var.monthly_digest_site_origin]
    allowed_methods = ["POST"]
    allowed_headers = ["*"]
    max_age_seconds = 900
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "monthly_digest" {
  count  = var.enable_monthly_digest ? 1 : 0
  bucket = aws_s3_bucket.monthly_digest[0].id
  rule {
    id     = "expire-reports"
    status = "Enabled"
    filter { prefix = "" }
    expiration { days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

resource "aws_cloudwatch_log_group" "monthly_digest" {
  count             = var.enable_monthly_digest ? 1 : 0
  name              = "/aws/lambda/${local.digest_name}"
  retention_in_days = 30
}

resource "aws_iam_role" "monthly_digest" {
  count = var.enable_monthly_digest ? 1 : 0
  name  = local.digest_name
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole"
  }] })
}

resource "aws_iam_role_policy" "monthly_digest" {
  count = var.enable_monthly_digest ? 1 : 0
  role  = aws_iam_role.monthly_digest[0].id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.monthly_digest[0].arn}:*" },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["${aws_s3_bucket.monthly_digest[0].arn}/uploads/*", "${aws_s3_bucket.monthly_digest[0].arn}/archive/*"] },
    { Effect = "Allow", Action = ["bedrock:InvokeModel"], Resource = [
      "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/${var.monthly_digest_model_id}",
      "arn:aws:bedrock:*::foundation-model/${local.digest_model_name}"
    ] }
    ], var.monthly_digest_slack_secret_arn == "" ? [] : [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.monthly_digest_slack_secret_arn }
  ]) })
}

resource "aws_lambda_function" "monthly_digest" {
  count         = local.digest_ready ? 1 : 0
  function_name = local.digest_name
  package_type  = "Image"
  image_uri     = var.monthly_digest_image_uri
  architectures = ["x86_64"]
  role          = aws_iam_role.monthly_digest[0].arn
  memory_size   = 4096
  timeout       = 600
  ephemeral_storage { size = 1024 }
  environment {
    variables = {
      DATA_BUCKET                  = aws_s3_bucket.monthly_digest[0].id
      BEDROCK_MODEL_ID             = var.monthly_digest_model_id
      SLACK_SECRET_ARN             = var.monthly_digest_slack_secret_arn
      AWS_LWA_INVOKE_MODE          = "response_stream"
      AWS_LWA_READINESS_CHECK_PATH = "/health"
    }
  }
  depends_on = [aws_iam_role_policy.monthly_digest, aws_ecr_repository_policy.monthly_digest]
}

# No public Function URL: only authenticated requests from the MSP server invoke it.
resource "aws_iam_role_policy" "app_monthly_digest" {
  count = local.digest_ready ? 1 : 0
  name  = "invoke-monthly-digest"
  role  = aws_iam_role.app.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Action = "lambda:InvokeFunction", Resource = aws_lambda_function.monthly_digest[0].arn
  }] })
}

output "monthly_digest_ecr_url" {
  value = var.enable_monthly_digest ? aws_ecr_repository.monthly_digest[0].repository_url : ""
}
output "monthly_digest_function_name" {
  value = local.digest_ready ? aws_lambda_function.monthly_digest[0].function_name : ""
}
output "monthly_digest_upload_origin" {
  value = var.enable_monthly_digest ? "https://${aws_s3_bucket.monthly_digest[0].bucket}.s3.${var.aws_region}.amazonaws.com" : ""
}
