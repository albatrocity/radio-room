variable "aws_region" {
  description = "AWS region for SES and SNS (must match MAIL FROM MX hostname)."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile for SSO or credentials (e.g. lr-prod). When null, uses the default credential chain (AWS_PROFILE env var, instance role, etc.)."
  type        = string
  default     = null
}

variable "domain" {
  description = "Root domain for SES domain identity and Netlify DNS zone lookup (e.g. listeningroom.club)."
  type        = string
}

variable "mail_from_subdomain" {
  description = "Custom MAIL FROM subdomain prefix (creates mail.example.com when domain is example.com)."
  type        = string
  default     = "mail"
}

variable "newsletter_from_address" {
  description = "From address used by the app (must match IAM policy and NEWSLETTER_FROM env var)."
  type        = string
}

variable "webhook_url" {
  description = "HTTPS URL for SES bounce/complaint SNS notifications (e.g. https://api.example.com/api/newsletter/webhooks/ses)."
  type        = string
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

variable "dmarc_policy" {
  description = "DMARC policy (p= tag). Use 'none' to monitor only; tighten to 'quarantine'/'reject' once you trust alignment."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "quarantine", "reject"], var.dmarc_policy)
    error_message = "dmarc_policy must be one of: none, quarantine, reject."
  }
}

variable "dmarc_rua_address" {
  description = "Email address for DMARC aggregate (rua) reports. When null, the DMARC record omits rua/fo (no reports requested)."
  type        = string
  default     = null
}

variable "iam_user_name" {
  description = "IAM user name for the SES sender credentials used by Heroku."
  type        = string
  default     = "listening-room-newsletter-sender"
}

variable "sns_topic_name" {
  description = "SNS topic name for SES bounce and complaint events."
  type        = string
  default     = "listening-room-newsletter-ses-events"
}
