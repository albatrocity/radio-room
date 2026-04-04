# 0029. Public read-only scheduling API for local-remote segment picker

**Date:** 2026-04-04  
**Status:** Accepted

## Context

The local-remote UI ([ADR 0025](0025-local-remote-rust-daemon.md)) runs on **`http://127.0.0.1:9876`** and needs to list **ready** shows and load **segment ids/titles** for OSC mapping. Cross-origin **`fetch`** from that origin to a production API cannot rely on **Better Auth** session cookies: **`SameSite=Lax`** cookies are not sent on such requests, and asking operators to copy cookies into a local config field is poor UX.

[ADR 0027](0027-local-remote-scheduling-ui-cors.md) documented CORS for **credentialed** reads from local-remote to **`/api/scheduling/*`**, which did not solve the cookie problem for production.

## Decision

1. Add **unauthenticated**, **read-only** HTTP routes on the platform API:
   - **`GET /api/public/scheduling/ready-shows`** — returns **`{ shows }`** where each show is a **ready** row with only **`id`**, **`title`**, **`startTime`** (ISO string).
   - **`GET /api/public/scheduling/shows/:id`** — returns **`{ show }`** with the same minimal show fields plus ordered **`segments`** (join id, **`segmentId`**, **`position`**, **`segment: { id, title }`**) **only** when the show’s status is **`ready`**. Otherwise respond **`404`** (do not distinguish draft vs published in the error).

2. Implement these using **`SchedulingService`** queries that **do not** reuse the full admin **`findShowById`** payload (no room export, playlist tracks, assignees, tags, etc.).

3. **local-remote** calls these URLs directly from the browser against **`platformApiBaseUrl`** (no daemon proxy, no stored session cookie).

4. Leave **`GET /api/scheduling/*`** (admin) and **`GET /api/scheduling/shows/:id`** with **`schedulingShowReadAuth`** ([`packages/server/middleware/schedulingShowReadAuth.ts`](../../packages/server/middleware/schedulingShowReadAuth.ts)) unchanged for scheduler apps, DJs, and room-scoped reads.

## Consequences

- **Positive:** Simple operator UX: set API base URL and **Fetch ready shows** with no login step.
- **Positive:** Works for local dev and production APIs as long as **CORS** allows the local-remote origin ([ADR 0027](0027-local-remote-scheduling-ui-cors.md)).
- **Negative:** Anyone who can reach the API can read **titles/times** of **ready** shows and **segment ids/titles** for those shows. Treat **ready** as “operator-visible prep state,” not secret. If stricter confidentiality is required later, add an optional shared secret or network restriction at the edge.
