---
name: Newsletter via Resend
overview: Add an owned subscriber list, an admin email composer in the scheduler app (markdown into a react-email template with drafts + scheduling), and Resend-backed delivery via Broadcasts/Audiences with webhooks that sync unsubscribe/suppression state back into our database.
todos:
  - id: db-schema
    content: Add subscriber + newsletter_issue tables in packages/db/src/schema/subscribers.ts (wantsEmail default true, entitlement reserved), export from index.ts, generate + commit migration
    status: pending
  - id: email-pkg
    content: Create @repo/email package with react-email NewsletterEmail + ConfirmEmail templates and renderNewsletter/renderConfirm helpers (markdown -> sanitized HTML, includes RESEND_UNSUBSCRIBE_URL)
    status: pending
  - id: resend-service
    content: "Add NewsletterService with Resend client wrapper: Audience contact sync, broadcast create/schedule/cancel, webhook handlers (svix-verified)"
    status: pending
  - id: newsletter-router
    content: Add newsletterRouter (admin issue CRUD, preview, send, schedule, cancel, subscribers) + public subscribe/confirm + Resend webhook; register in packages/server/index.ts
    status: pending
  - id: scheduler-ui
    content: Add scheduler routes/hooks/api for issue list + composer (reuse MarkdownEditor, iframe preview, drafts, schedule/cancel) + NavSidebar entry + shared DTOs in packages/types
    status: pending
  - id: scheduled-fallback
    content: Wire Resend-native scheduledAt as primary; sketch optional Redis sorted-set + JobService cron fallback
    status: pending
  - id: config-adr
    content: Add RESEND_* env vars to .env.example/compose/Heroku, extend CORS for subscribe origin, write ADR 0065 and update ADR index
    status: pending
isProject: false
---

# Email Newsletter via Resend

## Architecture

Our DB is the source of truth for who exists and their preferences; Resend owns delivery + compliance; the scheduler is the authoring UI.

```mermaid
flowchart TB
  subgraph sched [apps/scheduler admin]
    Composer["Composer route (markdown + preview)"]
  end
  subgraph api [apps/api - @repo/server]
    NLRouter["/api/newsletter/* (requireAdmin)"]
    Public["/api/newsletter/subscribe + /confirm (public)"]
    Hook["/api/newsletter/webhooks/resend (svix-verified)"]
    NLService["NewsletterService"]
  end
  subgraph email [@repo/email]
    Tmpl["react-email templates + markdown render"]
  end
  subgraph stores [Stores]
    PG[("Postgres: subscriber, newsletter_issue")]
  end
  Resend["Resend: Audience/Segment + Broadcasts"]

  Composer -->|"credentials: include"| NLRouter --> NLService
  Public --> NLService
  NLService --> PG
  NLService --> Tmpl
  NLService -->|"create/schedule broadcast, sync contacts"| Resend
  Resend -->|"contact.updated / email.bounced / complained"| Hook --> NLService
```

## Decisions
- Broadcasts + Audiences for sends (native one-click unsubscribe via `{{{RESEND_UNSUBSCRIBE_URL}}}`).
- `scheduledAt` on broadcasts for scheduling; Redis + cron only as documented fallback.
- Server-rendered HTML via new `@repo/email` (react-email) so newsletter, opt-in email, and preview share one template.
- Double opt-in backend included; public signup form UI out of scope.

## 1. Database (`@repo/db`)
New file `packages/db/src/schema/subscribers.ts`, exported from [packages/db/src/schema/index.ts](packages/db/src/schema/index.ts). Follow the scheduling table conventions (CUID2 `$defaultFn`, `pgEnum`, `withTimezone`) shown in [packages/db/src/schema/scheduling.ts](packages/db/src/schema/scheduling.ts).

- `subscriber`:
  - `id`, `email` (unique, notNull)
  - `status` enum `subscriber_status`: `pending | active | unsubscribed` (default `pending`)
  - `wantsEmail` boolean notNull default `true` -- your caveat: paid membership can exist without email
  - `entitlement` text default `"free"` -- reserved for future paid tiers
  - `resendContactId` text nullable -- link to Resend Audience contact for sync
  - `source` text nullable, `confirmedAt` / `unsubscribedAt` timestamptz nullable
  - `userId` text nullable, `references(() => user.id, { onDelete: "set null" })` -- reserved for future reconciliation with room/admin identity (unused now)
  - `createdAt` / `updatedAt` timestamptz
- `newsletter_issue`:
  - `id`, `subject` notNull, `bodyMarkdown` text notNull default `''`
  - `status` enum `newsletter_issue_status`: `draft | scheduled | sending | sent | canceled | failed` (default `draft`)
  - `scheduledAt` / `sentAt` timestamptz nullable
  - `resendBroadcastId` text nullable
  - `createdBy` text notNull `references(() => user.id)`
  - `createdAt` / `updatedAt`

Then `npm run db:generate -w @repo/db` and commit the generated `packages/db/drizzle/00NN_*.sql` (+ meta). Heroku release phase applies it automatically via [heroku.yml](heroku.yml).

## 2. `@repo/email` package (react-email)
New `packages/email` with `@react-email/components`, `@react-email/render`, and `marked` + `sanitize-html`:
- `renderNewsletter({ subject, bodyMarkdown })`: markdown -> sanitized HTML -> injected into a `NewsletterEmail` react-email layout -> returns HTML string. Layout must include `{{{RESEND_UNSUBSCRIBE_URL}}}` in the footer (required for broadcast compliance).
- `renderConfirmEmail({ confirmUrl })`: double opt-in template.
Rendering happens server-side in the API so the composer only ships markdown + subject.

## 3. Backend: service + routes (`@repo/server`)
Following the scheduling router pattern ([packages/server/routes/schedulingRouter.ts](packages/server/routes/schedulingRouter.ts), [packages/server/services/SchedulingService.ts](packages/server/services/SchedulingService.ts)) and registration in [packages/server/index.ts](packages/server/index.ts).

- `packages/server/services/NewsletterService.ts`: subscriber CRUD, issue CRUD, Resend integration (thin `resend` client wrapper reading `RESEND_API_KEY`), Audience contact sync, broadcast create/schedule/cancel, webhook handlers.
- `packages/server/routes/newsletterRouter.ts` mounted `.use("/api/newsletter", requireAdmin ?? noopMiddleware, createNewsletterRouter())`:
  - `GET/POST/PUT/DELETE /issues` (drafts), `GET /issues/:id`
  - `POST /issues/:id/preview` -> `{ html }` (renders via `@repo/email`, shown in composer iframe)
  - `POST /issues/:id/send` -> immediate broadcast (`resend.broadcasts.create({ segmentId, from, subject, html, send: true })`)
  - `POST /issues/:id/schedule` `{ scheduledAt }` -> broadcast with `scheduledAt`; store `resendBroadcastId`, set status `scheduled`
  - `POST /issues/:id/cancel` -> cancel scheduled broadcast
  - `GET /subscribers` (admin list/segment counts)
- Public routes (mounted outside `requireAdmin`, like [packages/server/routes/publicSchedulingRoutes.ts](packages/server/routes/publicSchedulingRoutes.ts)):
  - `POST /api/newsletter/subscribe` `{ email }` -> upsert `pending` subscriber, send double opt-in email
  - `GET /api/newsletter/confirm?token=...` -> mark `active`, `confirmedAt`, then create Resend Audience contact and store `resendContactId`
- Webhook: `POST /api/newsletter/webhooks/resend` (public, verified with `svix` using `RESEND_WEBHOOK_SECRET`). Handle `contact.updated` (unsubscribe toggled in Resend), `email.bounced`, `email.complained` -> set our subscriber `wantsEmail=false` / `status=unsubscribed`. This is the requested status/Audience sync.

Sync direction: on confirm/opt-in -> add contact to Audience; on our-side unsubscribe -> `resend.contacts.update({ unsubscribed: true })`; on Resend-side unsubscribe -> webhook updates our row.

## 4. Scheduled sends
- Primary: Resend `scheduledAt` (natural language or ISO 8601, up to 30 days). No custom infra.
- Fallback sketch (only if needed beyond 30 days or self-computed recipients): Redis sorted set `newsletter:scheduled` (score = epoch ms, value = issueId) polled by a `JobService` cron (pattern: [packages/server/services/JobService.ts](packages/server/services/JobService.ts), sorted-set usage in [packages/server/operations/data/polls.ts](packages/server/operations/data/polls.ts)) that renders + sends when due.

## 5. Scheduler UI (`apps/scheduler`)
Reuse existing patterns (route file + `src/lib/api.ts` + hook + `NavSidebar` entry; auth already gated by [apps/scheduler/src/routes/__root.tsx](apps/scheduler/src/routes/__root.tsx)).
- Route `apps/scheduler/src/routes/newsletter.tsx` (list of issues) + `apps/scheduler/src/routes/newsletter/$issueId.tsx` (composer). `routeTree.gen.ts` regenerates automatically.
- Composer: reuse [apps/scheduler/src/components/publish/MarkdownEditor.tsx](apps/scheduler/src/components/publish/MarkdownEditor.tsx) for the body; `@tanstack/react-form` for subject/schedule fields; a "Preview" tab rendering the `/preview` HTML in an `<iframe srcdoc>` for true email fidelity.
- Actions: Save draft, Send now, Schedule (datetime), Cancel. Mutations via React Query + `toaster` (pattern in [apps/scheduler/src/hooks/usePublishShow.ts](apps/scheduler/src/hooks/usePublishShow.ts)).
- Add API fns to [apps/scheduler/src/lib/api.ts](apps/scheduler/src/lib/api.ts), query keys to [apps/scheduler/src/lib/queryClient.ts](apps/scheduler/src/lib/queryClient.ts), hooks in `apps/scheduler/src/hooks/useNewsletter.ts`, nav link in [apps/scheduler/src/components/layout/NavSidebar.tsx](apps/scheduler/src/components/layout/NavSidebar.tsx). Shared DTOs in `packages/types`.

## 6. Config, CORS, ADR
- Env (add to [.env.example](.env.example), `compose.yml` api service, and Heroku): `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` (default newsletter segment), `RESEND_WEBHOOK_SECRET`, `RESEND_FROM` (e.g. `Listening Room <news@...>`), reuse `APP_URL` for confirm links. Read at point of use with a guard (pattern like `STREAM_HEALTH_SECRET`).
- CORS: the public `/subscribe` origin (web/archives site) must be allowed in the CORS allowlist in [packages/server/index.ts](packages/server/index.ts).
- ADR: add `docs/adrs/0065-email-newsletter-via-resend.md` (subscriber ownership, Broadcasts/Audiences, double opt-in, webhook sync) and update [docs/adrs/index.md](docs/adrs/index.md).

## Out of scope (follow-ups)
- Public-facing signup form UI (would live in `apps/web` or the archives site, calling `POST /api/newsletter/subscribe`).
- Paid tiers / Stripe entitlement webhooks (schema leaves `entitlement` reserved).
- Per-recipient open/click analytics UI (visible in Resend dashboard).