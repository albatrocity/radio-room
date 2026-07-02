output "ses_domain_identity" {
  description = "Verified SES domain identity."
  value       = aws_sesv2_email_identity.domain.email_identity
}

output "mail_from_domain" {
  description = "Custom MAIL FROM domain configured in SES."
  value       = local.mail_from_domain
}

output "dmarc_record" {
  description = "DMARC TXT record value published at _dmarc.<domain>."
  value       = local.dmarc_value
}

output "dkim_tokens" {
  description = "SES DKIM tokens (also published as Netlify CNAME records)."
  value       = aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens
}

output "sns_topic_arn" {
  description = "SNS topic ARN for bounce/complaint events."
  value       = aws_sns_topic.ses_events.arn
}

output "ses_sender_access_key_id" {
  description = "AWS access key ID for Heroku NEWSLETTER / AWS_ACCESS_KEY_ID."
  value       = aws_iam_access_key.sender.id
}

output "ses_sender_secret_access_key" {
  description = "AWS secret access key for Heroku AWS_SECRET_ACCESS_KEY."
  value       = aws_iam_access_key.sender.secret
  sensitive   = true
}

output "heroku_env_snippet" {
  description = "Copy these into Heroku config vars or .env after apply."
  value       = <<-EOT
    NEWSLETTER_FROM=Listening Room <${var.newsletter_from_address}>
    AWS_REGION=${var.aws_region}
    AWS_ACCESS_KEY_ID=${aws_iam_access_key.sender.id}
    AWS_SECRET_ACCESS_KEY=<run: terraform output -raw ses_sender_secret_access_key>
    NEWSLETTER_UNSUBSCRIBE_SECRET=<generate a random string>
  EOT
  sensitive   = true
}
