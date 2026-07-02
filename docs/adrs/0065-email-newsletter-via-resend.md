# 0065. Email Newsletter via Resend

**Date:** 2026-07-02
**Status:** Superseded by [0066](0066-email-newsletter-via-amazon-ses.md)

## Context

Listening Room needs an owned email newsletter for show updates and community announcements. Requirements include:

- Subscriber list we control (with room for future paid tiers without email)
- Admin authoring UI in the scheduler app
- Reliable delivery with one-click unsubscribe compliance
- Double opt-in for new subscribers
- Sync of unsubscribe/suppression state between our database and the email provider

## Decision

1. **Subscriber ownership**: Postgres tables `subscriber` and `newsletter_issue` in `@repo/db` are the source of truth for who exists, preferences (`wantsEmail`, `entitlement`), and issue drafts/schedules.

2. **Delivery provider**: [Resend](https://resend.com) Broadcasts + Segments (env `RESEND_AUDIENCE_ID`) for sends. Transactional double opt-in uses `resend.emails.send`. Broadcast HTML includes `{{{RESEND_UNSUBSCRIBE_URL}}}` for compliance.

3. **Templates**: New `@repo/email` package renders react-email layouts server-side (`renderNewsletter`, `renderConfirmEmail`). Markdown body is sanitized before injection.

4. **API surface** (`packages/server`):
   - Admin routes under `/api/newsletter/*` (require admin)
   - Public `POST /api/newsletter/subscribe`, `GET /api/newsletter/confirm`
   - Webhook `POST /api/newsletter/webhooks/resend` (Svix-verified raw body)

5. **Scheduling**: Primary path uses Resend `scheduledAt` (≤30 days). Issues scheduled beyond 30 days are stored in Redis sorted set `newsletter:scheduled` and sent by `newsletter-scheduled` JobService cron.

6. **Sync direction**: On confirm → create Resend contact in segment; on Resend `contact.updated` / bounce / complaint webhooks → mark subscriber `unsubscribed` and `wantsEmail=false` in our DB.

7. **UI**: Scheduler routes `/newsletter` (issue list) and `/newsletter/$issueId` (composer with markdown editor + iframe preview).

## Consequences

- Requires Resend account, verified domain, audience/segment, and webhook secret in production.
- Public signup form UI is out of scope; only the API endpoint exists for a future archives/web form.
- Per-recipient analytics remain in the Resend dashboard unless we add a follow-up UI.
- Redis fallback adds a minute-granularity cron dependency for long-dated schedules.

## See also

- [packages/server/services/NewsletterService.ts](../../packages/server/services/NewsletterService.ts)
- [packages/email](../../packages/email)
- [apps/scheduler/src/routes/newsletter.tsx](../../apps/scheduler/src/routes/newsletter.tsx)
