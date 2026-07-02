locals {
  mail_from_domain = "${var.mail_from_subdomain}.${var.domain}"
  netlify_zone_id  = coalesce(var.netlify_dns_zone_id, one(data.netlify_dns_zone.primary[*].id))
  ses_feedback_mx  = "feedback-smtp.${var.aws_region}.amazonses.com"
}

# ---------------------------------------------------------------------------
# Netlify DNS zone lookup (skipped when netlify_dns_zone_id is provided)
# ---------------------------------------------------------------------------

data "netlify_dns_zone" "primary" {
  count = var.netlify_dns_zone_id == null ? 1 : 0
  name  = var.domain
}

# ---------------------------------------------------------------------------
# SES domain identity (Easy DKIM) + custom MAIL FROM
# ---------------------------------------------------------------------------

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

resource "aws_sesv2_email_identity_mail_from_attributes" "domain" {
  email_identity   = aws_sesv2_email_identity.domain.email_identity
  mail_from_domain = local.mail_from_domain
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

# ---------------------------------------------------------------------------
# Netlify DNS: DKIM (3x CNAME), MAIL FROM MX + SPF
# ---------------------------------------------------------------------------

resource "netlify_dns_record" "dkim" {
  count = 3

  zone_id  = local.netlify_zone_id
  type     = "CNAME"
  hostname = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.domain}"
  value    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"
}

resource "netlify_dns_record" "mail_from_mx" {
  zone_id  = local.netlify_zone_id
  type     = "MX"
  hostname = local.mail_from_domain
  value    = local.ses_feedback_mx
  priority = 10
}

resource "netlify_dns_record" "mail_from_spf" {
  zone_id  = local.netlify_zone_id
  type     = "TXT"
  hostname = local.mail_from_domain
  value    = "v=spf1 include:amazonses.com ~all"
}

# ---------------------------------------------------------------------------
# SNS topic for bounce/complaint notifications -> API webhook
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "ses_events" {
  name = var.sns_topic_name
}

resource "aws_sns_topic_policy" "ses_events" {
  arn = aws_sns_topic.ses_events.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowSESPublish"
        Effect    = "Allow"
        Principal = { Service = "ses.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.ses_events.arn
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
    ]
  })
}

resource "aws_sns_topic_subscription" "webhook" {
  topic_arn              = aws_sns_topic.ses_events.arn
  protocol               = "https"
  endpoint               = var.webhook_url
  endpoint_auto_confirms = true
}

resource "aws_ses_identity_notification_topic" "bounce" {
  identity                 = aws_sesv2_email_identity.domain.email_identity
  notification_type        = "Bounce"
  topic_arn                = aws_sns_topic.ses_events.arn
  include_original_headers = false
}

resource "aws_ses_identity_notification_topic" "complaint" {
  identity                 = aws_sesv2_email_identity.domain.email_identity
  notification_type        = "Complaint"
  topic_arn                = aws_sns_topic.ses_events.arn
  include_original_headers = false
}

# ---------------------------------------------------------------------------
# IAM sender (Heroku uses static access keys)
# ---------------------------------------------------------------------------

resource "aws_iam_user" "sender" {
  name = var.iam_user_name
  path = "/listening-room/"
}

resource "aws_iam_access_key" "sender" {
  user = aws_iam_user.sender.name
}

resource "aws_iam_user_policy" "sender" {
  name = "ses-send-newsletter"
  user = aws_iam_user.sender.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SendNewsletterEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress" = var.newsletter_from_address
          }
        }
      },
    ]
  })
}
