# 0177. Listener What’s new from bundled markdown

**Date:** 2026-09-15
**Status:** Accepted

## Context

Listeners need a short recap of new features and bugfixes since the last show (roughly monthly). Options considered:

1. **Scheduler CMS** (Postgres + admin editor) — copy can change without a deploy; overlaps newsletter authoring patterns ([ADR 0066](0066-email-newsletter-via-amazon-ses.md)).
2. **GitHub Releases** — this repo does not tag monthly product releases.
3. **Auto-generated commit/PR changelogs** — engineering voice, not listener copy.
4. **In-repo markdown shipped with the web app** — notes stay locked to the build listeners actually run.

Show cadence (not semver) is the grain listeners care about. Admins already email show notes via the newsletter; What’s new is an in-room surface for people who are already listening.

## Decision

1. **Source of truth** — [`apps/web/src/content/whats-new.md`](../../apps/web/src/content/whats-new.md). Newest month first. Headings are `## Month YYYY` (e.g. `## September 2026`). Authors add bullets in the same PR as the user-visible change under `### New` / `### Fixed`.

2. **Bundle with the web app** — Vite `?raw` import; parse client-side. No scheduler UI, Postgres, REST, or Socket.IO events. Copy updates only when the web app deploys.

3. **Unread attention** — Latest month id (`2026-09`) drives the badge via the client notification center ([ADR 0144](0144-client-notification-center.md)). Source: `whatsNewActor`. Target `{ surface: "whatsNew" }`, `clearOn: "view"`, `persist: true`, no toast. Viewed month ids live in global `localStorage` (`radioroom:whats-new-viewed`), not per-room. Mid-month bullet edits do not re-badge; a new month heading does.

4. **UI** — Settings (logo popover) → What’s new button with unread dot on the button and logo when unread. Overlay is a parallel `modalsMachine` region (`whatsNew`) so it does not collapse Game State / Admin Settings ([ADR 0146](0146-feedback-overlays-integrated-panel.md)). No auto-open on join.

5. **Empty file** — Hide the Settings button when there are no parseable months.

## Consequences

- Listener copy stays in git review with the feature that shipped it.
- Typo fixes during a show require a web deploy (accepted).
- Authors must remember to update `whats-new.md` (header comment + this ADR; no CI lint in v1).
- Studio-bridge unchanged (static client asset).

## See also

- [0144. Client notification center](0144-client-notification-center.md)
- [0146. Feedback overlays the integrated panel](0146-feedback-overlays-integrated-panel.md)
- `apps/web/src/lib/parseWhatsNew.ts`
- `apps/web/src/machines/whatsNewMachine.ts`
