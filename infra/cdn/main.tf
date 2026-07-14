locals {
  cdn_hostname    = "${var.cdn_subdomain}.${var.domain}"
  netlify_zone_id = coalesce(var.netlify_dns_zone_id, one(data.netlify_dns_zone.primary[*].id))
  logo_key        = "assets/logo.png"
}

# ---------------------------------------------------------------------------
# Netlify DNS zone lookup (skipped when netlify_dns_zone_id is provided)
# ---------------------------------------------------------------------------

data "netlify_dns_zone" "primary" {
  count = var.netlify_dns_zone_id == null ? 1 : 0
  name  = var.domain
}

# ---------------------------------------------------------------------------
# Private S3 bucket (CloudFront-only reads; browser PUTs via presigned URL)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "assets" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# ---------------------------------------------------------------------------
# ACM certificate (us-east-1) + Netlify DNS validation
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "cdn" {
  domain_name       = local.cdn_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "netlify_dns_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.domain_name => {
      name  = trimsuffix(dvo.resource_record_name, ".")
      type  = dvo.resource_record_type
      value = trimsuffix(dvo.resource_record_value, ".")
    }
  }

  zone_id  = local.netlify_zone_id
  type     = each.value.type
  hostname = each.value.name
  value    = each.value.value
}

resource "aws_acm_certificate_validation" "cdn" {
  certificate_arn = aws_acm_certificate.cdn.arn
  validation_record_fqdns = [
    for dvo in aws_acm_certificate.cdn.domain_validation_options : dvo.resource_record_name
  ]

  depends_on = [netlify_dns_record.acm_validation]
}

# ---------------------------------------------------------------------------
# CloudFront + Origin Access Control
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC for Listening Room asset CDN"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "assets" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Listening Room newsletter / static assets"
  aliases         = [local.cdn_hostname]
  price_class     = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id                = "s3-assets"
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-assets"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cdn.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  depends_on = [aws_acm_certificate_validation.cdn]
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalRead"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.assets.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.assets.arn
          }
        }
      },
    ]
  })

  depends_on = [
    aws_s3_bucket_public_access_block.assets,
    aws_s3_bucket_ownership_controls.assets,
  ]
}

# ---------------------------------------------------------------------------
# CDN hostname in Netlify DNS
# ---------------------------------------------------------------------------

resource "netlify_dns_record" "cdn" {
  zone_id  = local.netlify_zone_id
  type     = "CNAME"
  hostname = local.cdn_hostname
  value    = aws_cloudfront_distribution.assets.domain_name
}

# ---------------------------------------------------------------------------
# IAM: allow existing SES sender user to PutObject (presigned uploads)
# ---------------------------------------------------------------------------

data "aws_iam_user" "sender" {
  user_name = var.iam_user_name
}

resource "aws_iam_user_policy" "sender_s3_put" {
  name = "asset-cdn-s3-put"
  user = data.aws_iam_user.sender.user_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "PutNewsletterAssets"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.assets.arn}/*"
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# Seed logo (placeholder until brand PNG replaces assets/logo.png)
# ---------------------------------------------------------------------------

resource "aws_s3_object" "logo" {
  bucket       = aws_s3_bucket.assets.id
  key          = local.logo_key
  source       = "${path.module}/assets/logo.png"
  content_type = "image/png"
  etag         = filemd5("${path.module}/assets/logo.png")

  depends_on = [aws_s3_bucket_policy.assets]
}
