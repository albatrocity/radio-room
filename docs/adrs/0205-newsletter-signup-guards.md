# 0205. Newsletter signup guards

**Date:** 2026-10-23
**Status:** Accepted

## Context

`POST /api/newsletter/subscribe` sent an SES confirmation to any address that contained `@`, with no rate limit or bot check. `GET /api/newsletter/confirm` activated the subscription when the link was fetched. Mailbox security scanners (Outlook Safe Links, Proofpoint, and similar) prefetch links in incoming mail. A script could submit someone else's address, their scanner would activate it, and the next issue would arrive unrequested. The result was spam signups and an unsubscribe rate out of proportion to the number of issues sent.

## Decision

1. **GET does not activate.** `GET /api/newsletter/confirm?token&email` returns an HTML page with a single POST form. `POST /api/newsletter/confirm` (urlencoded `token`, `email`) calls `confirmSubscription` and redirects `303` to `${APP_URL}/newsletter/confirmed`. The email link URL is unchanged, so links already sent keep working with one extra click.
2. **Form token.** `GET /api/newsletter/form-token` returns a stateless HMAC token `${issuedAtMs}.${nonce}.${hmac}` signed with the unsubscribe secret. Subscribe accepts it only when it is at least 2 seconds and at most 30 minutes old. The footer form refreshes it every 20 minutes while mounted.
3. **Honeypot.** The form posts a `website` field that must be empty.
4. **Redis caps** on the API `pubClient`:
   - `newsletter:signup:ip:{ip}`: 5 subscribe POSTs per IP per hour, counted before any other check. Over the cap returns `429`.
   - `newsletter:signup:email:cooldown:{sha256}`: at most one confirmation every 10 minutes per address.
   - `newsletter:signup:email:day:{sha256}`: at most 3 confirmations per address per 24 hours.
   A failed SES send releases the cooldown and decrements the daily count. If Redis is unavailable the request fails rather than sending without a cap.
5. **Uniform response.** Bot signals, already-active addresses, and capped addresses all return `{ ok: true }` and send nothing. `alreadySubscribed` is removed from the response so the endpoint does not reveal list membership. A malformed email returns `400`.

## Consequences

- A scanner fetching the confirmation link no longer subscribes anyone, and no longer consumes the confirmation token.
- Clients that skip the form, submit instantly, or fill the honeypot are dropped before any database write or email.
- A script that fetches a token and waits still gets at most 5 sends per IP per hour, and a targeted address receives at most 3 confirmations a day. A CAPTCHA (for example Cloudflare Turnstile) is the next step if that volume appears.
- Someone who resubmits within 10 minutes, or a fourth time in a day, sees the same success message and receives nothing. Their earlier link still works for 7 days.
- A shared NAT can hit the IP cap during a burst.

## See also

- [ADR 0066](0066-email-newsletter-via-amazon-ses.md)
- [packages/server/services/newsletterSignupGuard.ts](../../packages/server/services/newsletterSignupGuard.ts)
- [packages/server/routes/newsletterRouter.ts](../../packages/server/routes/newsletterRouter.ts)
- [apps/web/src/components/NewsletterSubscribeForm.tsx](../../apps/web/src/components/NewsletterSubscribeForm.tsx)
