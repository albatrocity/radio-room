# 0066. Email Newsletter via Amazon SES

**Date:** 2026-07-02
**Status:** Accepted

Supersedes [0065](0065-email-newsletter-via-resend.md).

## Context

[ADR 0065](0065-email-newsletter-via-resend.md) chose Resend for newsletter delivery. Before shipping, Resend's pricing proved a poor fit for our early-phase usage:

- The free plan caps sending at **100 emails/day**. A single broadcast to more than ~100 subscribers exceeds this.
- Lifting the cap (and enabling pay-as-you-go) requires the **$20/mo** Pro plan.

Expected early volume is ~2 sends/month to ~300 subscribers (~600 emails/month) delivered in bursts of ~300. The requirement is: no daily cap, minimal fixed cost, and smooth linear scaling. Amazon SES fits: **$0.10 per 1,000 emails**, no monthly minimum, no daily cap after production access (~$0.06/month at this volume).

Because our Postgres database is already the source of truth for subscribers and preferences (ADR 0065 decision 1), we do not need Resend's Audience/Broadcast/contact-sync features. We can send directly to our own recipient list and own the compliance surface.

## Decision

1. **Provider**: Amazon SES via `@aws-sdk/client-sesv2` (`SendEmailCommand`). Credentials use the standard AWS provider chain; region from `AWS_REGION`. Sender from `NEWSLETTER_FROM` (a verified SES identity).

2. **Sending model**: No broadcasts/audiences. `NewsletterService` loads `active` subscribers with `wantsEmail = true` from Postgres and sends one SES message per recipient (bounded concurrency). Each message carries a per-recipient unsubscribe URL and `List-Unsubscribe` / `List-Unsubscribe-Post` headers (RFC 8058 one-click).

3. **Unsubscribe**: Stateless HMAC tokens (`NEWSLETTER_UNSUBSCRIBE_SECRET`, falling back to `BETTER_AUTH_SECRET`). Public `GET`/`POST /api/newsletter/unsubscribe?token=...` verifies the token and sets the subscriber `unsubscribed` / `wantsEmail = false`. The `@repo/email` template takes an `unsubscribeUrl` prop (replacing Resend's `{{{RESEND_UNSUBSCRIBE_URL}}}`).

4. **Bounce/complaint sync**: SES publishes to SNS; `POST /api/newsletter/webhooks/ses` verifies the SNS signature (`sns-validator`), auto-confirms `SubscriptionConfirmation`, and on permanent bounces / complaints suppresses the recipient in our DB.

5. **Scheduling**: The Redis sorted set `newsletter:scheduled` (score = epoch ms, value = issueId) is now the **primary** scheduling mechanism (previously the ADR 0065 fallback), drained by the `newsletter-scheduled` JobService cron. There is no provider-native scheduled broadcast.

6. **Schema**: Dropped the Resend-specific columns (`subscriber.resend_contact_id`, `newsletter_issue.resend_broadcast_id`) since there is no external contact/broadcast to reference.

Unchanged from ADR 0065: subscriber ownership in Postgres, double opt-in, server-rendered `@repo/email` templates, and the scheduler composer UI.

## Consequences

- Near-zero fixed cost; scales linearly (~$0.10 per 1,000 emails) with no tier cliffs.
- Requires AWS setup: verified SES domain, production-access request (to leave the sandbox), and an SNS topic wired to bounce/complaint notifications pointing at the webhook.
- We own more of the compliance surface (unsubscribe endpoint, suppression on bounce/complaint) rather than delegating to the provider.
- Per-recipient rendering + individual sends are fine at hundreds of recipients; a very large list would warrant batching or SES bulk templates.

## See also

- [packages/server/services/NewsletterService.ts](../../packages/server/services/NewsletterService.ts)
- [packages/server/routes/newsletterRouter.ts](../../packages/server/routes/newsletterRouter.ts)
- [packages/email](../../packages/email)
