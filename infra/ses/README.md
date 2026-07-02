# Newsletter SES (Terraform)

Self-contained Terraform for the Listening Room newsletter email footprint on **Amazon SES** + **SNS**, with **Netlify DNS** records for DKIM and custom MAIL FROM. Mirrors the layout of [infra/mediamtx/](../mediamtx/).

`terraform destroy` removes the SES identity, SNS topic/subscription, IAM sender, and the DNS records created here.

## What this creates

| Resource | Purpose |
|----------|---------|
| `aws_sesv2_email_identity` | Domain identity with Easy DKIM |
| `aws_sesv2_email_identity_mail_from_attributes` | Custom MAIL FROM (`mail.<domain>`) |
| `netlify_dns_record` × 5 | 3 DKIM CNAMEs, MAIL FROM MX, MAIL FROM SPF TXT |
| `aws_sns_topic` + policy | Bounce/complaint event bus |
| `aws_sns_topic_subscription` | HTTPS → `/api/newsletter/webhooks/ses` |
| `aws_ses_identity_notification_topic` × 2 | Bounce + Complaint → SNS |
| `aws_iam_user` + access key | `ses:SendEmail` for Heroku (scoped to from address) |

Application code lives in `@repo/server` ([NewsletterService.ts](../../packages/server/services/NewsletterService.ts)); this module only provisions AWS + DNS.

## Prerequisites

1. **AWS member account** with SSO configured. Log in before running Terraform:
   ```bash
   aws sso login --profile listening-room
   ```
   Set `aws_profile = "listening-room"` in `terraform.tfvars` so apply always targets the dedicated account (not your personal one).
2. **Netlify DNS** hosting the domain (personal access token: [Netlify user settings → Applications](https://app.netlify.com/user/applications)).
3. **API deployed** with the newsletter webhook route live at `webhook_url` before `terraform apply` (SNS confirms the HTTPS subscription by POSTing to your app).
4. **Terraform** 1.0+ or OpenTofu 1.0+.

## Quick start

```bash
cd infra/ses
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars (domain, webhook_url, newsletter_from_address)

export TF_VAR_netlify_api_token="nfp_..."   # or set in terraform.tfvars
aws sso login --profile listening-room
terraform init
terraform plan
terraform apply
```

After apply, copy credentials into Heroku / `.env`:

```bash
terraform output -raw ses_sender_access_key_id
terraform output -raw ses_sender_secret_access_key
```

Set:

```env
NEWSLETTER_FROM=Listening Room <news@yourdomain.com>
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
NEWSLETTER_UNSUBSCRIBE_SECRET=<random string>
```

Or use `terraform output heroku_env_snippet` as a checklist (secret key is redacted).

## Manual steps (not automated)

### Exit the SES sandbox

New SES accounts are in **sandbox mode** (can only send to verified addresses). Request **production access** in the AWS SES console: *Account dashboard → Request production access*. One-time; usually approved within a day.

### DKIM propagation

After `apply`, DKIM CNAMEs are created in Netlify. SES may take up to 72 hours to show **Verified** for DKIM, but it is often minutes. Check **SES → Identities → your domain**.

### SNS subscription

If the webhook was not reachable during `apply`, the HTTPS subscription may stay pending. Re-run `terraform apply` after the API is live, or confirm manually in the SNS console. The app auto-confirms `SubscriptionConfirmation` messages at `POST /api/newsletter/webhooks/ses`.

## Teardown

```bash
cd infra/ses
terraform destroy
```

Removes AWS resources and the five Netlify DNS records managed by this module. Does **not** delete unrelated DNS records on the zone.

## Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `domain` | yes | Root domain (Netlify DNS zone name) |
| `newsletter_from_address` | yes | e.g. `news@listeningroom.club` |
| `webhook_url` | yes | HTTPS SNS endpoint |
| `netlify_api_token` | yes* | Netlify PAT (*or `NETLIFY_API_TOKEN` / `TF_VAR_netlify_api_token`) |
| `aws_region` | no | Default `us-east-1` |
| `aws_profile` | no | CLI profile name (e.g. `listening-room`); omit to use default credential chain |
| `mail_from_subdomain` | no | Default `mail` |
| `netlify_dns_zone_id` | no | Skip zone lookup if set |

## State

State is **local** and gitignored (`terraform.tfstate`). It contains the IAM secret access key. For team use, consider [HCP Terraform](https://developer.hashicorp.com/terraform/cloud-docs) free tier (500 resources) or an S3 backend.

## Cost

At ~600 emails/month: **~$0.06/month** SES sending + negligible SNS. See [ADR 0066](../../docs/adrs/0066-email-newsletter-via-amazon-ses.md).
