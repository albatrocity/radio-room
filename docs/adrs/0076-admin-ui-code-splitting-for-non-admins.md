# 0076. Role-Gated Admin UI Code Splitting for Non-Admins

**Date:** 2026-07-23
**Status:** Accepted

## Context

Room overlays mounted Settings (`ModalAdminSettings`), Quick Access panels, and `@repo/plugin-config-ui` (schema form + emoji fields) for every visitor. Non-admin listeners paid download and parse cost for admin-only UI. Menu helpers also imported `getQuickAccessSchema` from the package barrel, which re-exports the form and `fields` module.

Listener-facing room chrome (chat, plugin templates, playlist, reactions) is out of scope for this decision.

## Decision

1. **Role-gated lazy overlays.** `Overlays` loads `ModalAdminSettings` and `QuickAccessPanels` via `React.lazy` and mounts them only when `useIsAdmin()` is true. Non-admins never trigger those dynamic imports.
2. **Logic-only package entry.** `@repo/plugin-config-ui` exports `./logic` for pure schema helpers (`getQuickAccessSchema`, etc.). Web call sites that only list or filter Quick Access plugins import `@repo/plugin-config-ui/logic`. The form barrel (`@repo/plugin-config-ui`) is imported only from admin-lazy modules (and the scheduler app).
3. **Listener overlays stay eager.** Game state, queue, playlist, and similar non-admin surfaces are not split by this ADR.

## Consequences

- Non-admins download the main room chunk without the admin settings / plugin-config form chunks.
- Admins pay a short Suspense gap (or idle fetch) when admin status becomes true and those chunks load.
- Production build (2026-07-23) deferred approximately **~170 KB** raw / **~49 KB** gzip across:
  - `PluginConfigForm-*.js` (~125 KB / ~35 KB gzip)
  - `ModalAdminSettings-*.js` (~43 KB / ~12 KB gzip)
  - `QuickAccessPanels-*.js` (~3 KB / ~1 KB gzip)
- Lightweight `AdminControls` / `QuickAccessMenu` may remain in the shared room graph; they must not import the config-ui form barrel.

## See also

- [ADR 0074](0074-quick-access-admin-panels.md) — Quick Access panels host in `Overlays`
- [ADR 0068](0068-private-scoped-plugin-config-fields.md) — schema-driven config authoring
- [ADR 0075](0075-plugin-config-import-actions.md) — config import actions in the shared form
