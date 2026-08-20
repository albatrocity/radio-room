# 0105. Add to Queue UI session persistence

**Date:** 2026-08-20
**Status:** Accepted

## Context

Closing the Add to Queue modal (or remounting Browse when browseability flickers) drops the listener’s Search/Browse mode, catalog source, Artists/Albums/Media root tab, and active artist/album/media drill-down. That forces re-navigation for a common DJ flow. Other client prefs already use room-scoped `sessionStorage` via XState machines (e.g. quick-access panels).

## Decision

1. Own Add to Queue chrome + Browse location in **`addToQueueUiMachine`** / **`addToQueueUiActor`**, activated with the room (`ACTIVATE` / `DEACTIVATE` in `roomLifecycle`).
2. Persist to **`sessionStorage`**, keyed by room id (`addToQueueUi:{roomId}`), via a machine **`persistUi`** action on relevant transitions (same pattern as [quick-access panels](0074-quick-access-admin-panels.md) / metadata preference).
3. Stored fields: `mode` (`search` | `browse`), `sourceFilter`, and optional `browse` (`rootKind`, `level`, artist/album/media ids + titles).
4. **CatalogBrowse** reports location via `onBrowseLocationChange` and accepts `rootKind` on navigation for root-tab restore. Pending navigation + `ignoreBrowseLocation` gate restore/deep-link races.
5. Explicit deep-links (`EDIT_QUEUE` + `browseMediaKey`, Search → Browse) override restored state for that open.
6. Do not persist Search text results; keep in-memory Search/Browse mount behavior from [ADR 0090](0090-hybrid-metadata-catalog-browse.md).

## Consequences

- Modal close/reopen and full page reload in the same tab restore Browse place-in-catalog.
- FormAddToQueue stays presentational; room switch clears machine context on `DEACTIVATE`.
- Stale ids (removed album, revoked media) may show empty/error until the user navigates away; acceptable for session UX.

## See also

- [0090. Hybrid metadata catalog browse](0090-hybrid-metadata-catalog-browse.md)
- `apps/web/src/machines/addToQueueUiMachine.ts`
- `apps/web/src/actors/addToQueueUiActor.ts`
- `apps/web/src/components/FormAddToQueue.tsx`
- `apps/web/src/components/CatalogBrowse.tsx`
