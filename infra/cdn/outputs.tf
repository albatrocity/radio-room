output "bucket_name" {
  description = "S3 bucket name for ASSET_S3_BUCKET."
  value       = aws_s3_bucket.assets.id
}

output "bucket_arn" {
  description = "S3 bucket ARN."
  value       = aws_s3_bucket.assets.arn
}

output "cdn_hostname" {
  description = "Custom CDN hostname (e.g. cdn.listeningroom.club)."
  value       = local.cdn_hostname
}

output "cdn_base_url" {
  description = "HTTPS base URL for ASSET_CDN_BASE_URL (no trailing slash)."
  value       = "https://${local.cdn_hostname}"
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name (*.cloudfront.net)."
  value       = aws_cloudfront_distribution.assets.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidations)."
  value       = aws_cloudfront_distribution.assets.id
}

output "logo_url" {
  description = "Public CDN URL for the seeded logo PNG."
  value       = "https://${local.cdn_hostname}/${local.logo_key}"
}

output "heroku_env_snippet" {
  description = "Copy these into Heroku config vars or .env after apply."
  value       = <<-EOT
    ASSET_S3_BUCKET=${aws_s3_bucket.assets.id}
    ASSET_CDN_BASE_URL=https://${local.cdn_hostname}
    NEWSLETTER_LOGO_URL=https://${local.cdn_hostname}/${local.logo_key}
    # Scheduler preview (Vite build env):
    # VITE_ASSET_CDN_BASE_URL=https://${local.cdn_hostname}
  EOT
}
