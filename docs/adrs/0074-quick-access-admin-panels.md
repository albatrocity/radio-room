# 0074. Quick Access Admin Panels for Plugin Actions

**Date:** 2026-07-21
**Status:** Accepted

## Context

Plugin run-of-show controls (start/advance/end a quiz, start/end shopping sessions, reveal Guess the Tune fields) live as `type: "action"` elements in `getConfigSchema().layout`. Those actions only appear in the Settings modal today, which is awkward during a live show when multiple admins specialize (one runs the quiz, another manages shops).

Component-schema `adminOnly` buttons (e.g. Guess the Tune in `nowPlayingInfo`) already surface some actions in the room UI, but that path is area-specific and does not cover lifecycle actions that belong with config. We need a schema-driven, admin-only room surface for curated config actions without duplicating action definitions or editing config values mid-panel.

## Decision

1. **Opt-in list on the config schema.** `PluginConfigSchema` may include `quickAccess?: string[]` — action name strings that must match `layout` items with `type: "action"`. Order in `quickAccess` is the panel order. Unknown names are skipped.
2. **Actions only (v1).** Quick Access panels render those action buttons (including `showWhen` and optional `formFields`) via the existing web `PluginConfigForm` + `EXECUTE_PLUGIN_ACTION` path. Config field editing stays in Settings (panels can deep-link there).
3. **Enabled filter.** The Quick Access menu lists a plugin only when it has a non-empty resolvable `quickAccess` list **and** `pluginConfigs[name].enabled === true` (same convention as Settings overview).
4. **Client-only open set.** Which panels are open is stored in sessionStorage per room (`quickAccessPanels:{roomId}`). Desktop FloatingPanels use ephemeral default position/size (cascaded on open); geometry is not persisted. Mobile uses a Dialog. Disabling a plugin prunes its open record.
5. **Shared open state.** Because `AdminControls` mounts in multiple places, a room-scoped XState actor owns the open map; a single host in memoized `Overlays` renders panels (same stability pattern as schedule-note FloatingPanels under `memo(Sidebar)`).

## Consequences

- Plugin authors curate run-of-show actions once in `getConfigSchema` without a second component-schema area.
- Admins can keep multiple plugin panels open across reloads within a session; panel placement resets each open.
- Trade-off: enabling/disabling a plugin still requires Settings (or another surface); Quick Access deliberately does not edit config.
- Future work could add scalar config fields to panels; public config is replace-on-write, so any such path must save the full merged plugin config.

## See also

- [ADR 0004](0004-state-machines-for-ui-and-socket-events.md) — UI state machines
- [ADR 0006](0006-plugin-system-for-room-features.md) — plugin system
- [ADR 0068](0068-private-scoped-plugin-config-fields.md) — schema-driven config authoring
- [ADR 0075](0075-plugin-config-import-actions.md) — config import actions (may mutate config from paste)
- [`docs/plugins/admin-config.md`](../plugins/admin-config.md) — config schema authoring guide
