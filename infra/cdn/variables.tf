variable "aws_region" {
  description = "AWS region for S3 (ACM for CloudFront custom domains must be us-east-1)."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = var.aws_region == "us-east-1"
    error_message = "aws_region must be us-east-1 so the ACM certificate can be used by CloudFront."
  }
}

variable "aws_profile" {
  description = "AWS CLI profile for SSO or credentials (e.g. lr-prod). When null, uses the default credential chain."
  type        = string
  default     = null
}

variable "domain" {
  description = "Root domain for Netlify DNS zone lookup and CDN hostname (e.g. listeningroom.club)."
  type        = string
}

variable "cdn_subdomain" {
  description = "CDN subdomain prefix (creates cdn.example.com when domain is example.com)."
  type        = string
  default     = "cdn"
}

variable "bucket_name" {
  description = "S3 bucket name for newsletter/static assets. Must be globally unique."
  type        = string
  default     = "listening-room-assets"
}

variable "cors_allowed_origins" {
  description = "Browser origins allowed to PUT objects via presigned URLs (scheduler prod + local dev)."
  type        = list(string)
  default = [
    "http://127.0.0.1:8001",
    "http://localhost:8001",
  ]
}

variable "iam_user_name" {
  description = "Existing IAM user (from infra/ses) that receives s3:PutObject for presigned uploads."
  type        = string
  default     = "listening-room-newsletter-sender"
}

variable "netlify_api_token" {
  description = "Netlify personal access token for DNS record management. May also set NETLIFY_API_TOKEN env var."
  type        = string
  sensitive   = true
  default     = null
}

variable "netlify_dns_zone_id" {
  description = "Optional Netlify DNS zone ID. When set, skips netlify_dns_zone data source lookup by domain name."
  type        = string
  default     = null
}
