# Asset CDN (Terraform)

Self-contained Terraform for the Listening Room **newsletter / static asset CDN**: private **S3** bucket, **CloudFront** with Origin Access Control, custom hostname via **ACM** + **Netlify DNS**, and an `s3:PutObject` policy on the existing newsletter IAM sender user (from [infra/ses/](../ses/)).

`terraform destroy` removes the bucket (including objects), CloudFront distribution, ACM cert, IAM inline policy, and the DNS records created here.

## What this creates

| Resource | Purpose |
|----------|---------|
| `aws_s3_bucket` (+ public access block, ownership) | Private object store |
| `aws_s3_bucket_cors_configuration` | Browser `PUT` from scheduler origins (presigned URLs) |
| `aws_acm_certificate` + validation | TLS for `cdn.<domain>` (must be **us-east-1**) |
| `aws_cloudfront_origin_access_control` + `aws_cloudfront_distribution` | CDN in front of S3 |
| `aws_s3_bucket_policy` | Allow CloudFront `GetObject` only |
| `netlify_dns_record` × N | ACM validation CNAME(s) + `cdn` → CloudFront |
| `aws_iam_user_policy` | `s3:PutObject` on the SES sender user |
| `aws_s3_object` | Seeds `assets/logo.png` |

Application code (presigned uploads, email `<Img>`) lives outside this module; see the newsletter asset CDN plan / ADR.

## Prerequisites

1. **Apply [infra/ses](../ses/) first** so IAM user `listening-room-newsletter-sender` exists. This module attaches an additional inline policy to that user.
2. **AWS member account** with SSO configured:
   ```bash
   aws sso login --profile lr-prod
   ```
   Set `aws_profile = "lr-prod"` in `terraform.tfvars`.
3. **Netlify DNS** hosting the domain (personal access token: [Netlify user settings → Applications](https://app.netlify.com/user/applications)).
4. **Terraform** 1.0+ or OpenTofu 1.0+.
5. Region must stay **`us-east-1`** (ACM + CloudFront requirement). The variable is validated.

## Quick start

```bash
cd infra/cdn
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars (domain, bucket_name, cors_allowed_origins)

export TF_VAR_netlify_api_token="nfp_..."   # or set in terraform.tfvars
aws sso login --profile lr-prod
terraform init
terraform plan
terraform apply
```

After apply, set Heroku / `.env` (or use `terraform output heroku_env_snippet`):

```env
ASSET_S3_BUCKET=listening-room-assets
ASSET_CDN_BASE_URL=https://cdn.yourdomain.com
NEWSLETTER_LOGO_URL=https://cdn.yourdomain.com/assets/logo.png
```

Scheduler preview (Vite):

```env
VITE_ASSET_CDN_BASE_URL=https://cdn.yourdomain.com
```

Reuse the same `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from the SES sender user; that user now also has `s3:PutObject` on this bucket.

## CORS origins

`cors_allowed_origins` defaults to local scheduler (`http://127.0.0.1:8001`, `http://localhost:8001`). **Add the production scheduler HTTPS origin** before enabling browser uploads in prod, otherwise presigned `PUT`s fail CORS.

## Logo asset

`assets/logo.png` is committed and uploaded by Terraform. Replace the placeholder with the brand PNG and re-apply (or `terraform apply -replace=aws_s3_object.logo`) so CloudFront serves the update. Invalidating CloudFront may be needed if a long TTL still holds the old object:

```bash
aws cloudfront create-invalidation \
  --distribution-id "$(terraform output -raw cloudfront_distribution_id)" \
  --paths "/assets/logo.png" \
  --profile lr-prod
```

## Teardown

```bash
cd infra/cdn
terraform destroy
```

Empty buckets are removed with the module. Does **not** delete the SES IAM user (owned by `infra/ses`), only the `asset-cdn-s3-put` inline policy.

## Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `domain` | yes | Root domain (Netlify DNS zone name) |
| `netlify_api_token` | yes* | Netlify PAT (*or `NETLIFY_API_TOKEN` / `TF_VAR_netlify_api_token`) |
| `aws_region` | no | Must be `us-east-1` (default) |
| `aws_profile` | no | CLI profile (e.g. `lr-prod`) |
| `cdn_subdomain` | no | Default `cdn` |
| `bucket_name` | no | Default `listening-room-assets` |
| `cors_allowed_origins` | no | Local scheduler origins by default |
| `iam_user_name` | no | Default `listening-room-newsletter-sender` |
| `netlify_dns_zone_id` | no | Skip zone lookup if set |

## State

State is **local** and gitignored (`terraform.tfstate`). For team use, consider [HCP Terraform](https://developer.hashicorp.com/terraform/cloud-docs) or an S3 backend.

## Cost

S3 storage + requests and CloudFront transfer for a small newsletter asset footprint is typically **cents per month**. ACM certs for CloudFront are free.
