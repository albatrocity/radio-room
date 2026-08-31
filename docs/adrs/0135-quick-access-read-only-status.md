# 0135. Quick Access Read-Only Status Fields

**Date:** 2026-08-31
**Status:** Accepted

## Context

[ADR 0074](0074-quick-access-admin-panels.md) limited Quick Access panels to **action buttons** so run-of-show controls stay on the `EXECUTE_PLUGIN_ACTION` path. That avoids accidental config edits mid-show, but admins still need **at-a-glance context** beside those actions (e.g. whether auto-shop is on, the current interval). Settings is one click away, yet during a live show the panel should show current state without becoming a second config editor.

Public plugin config is replace-on-write on save ([ADR 0068](0068-private-scoped-plugin-config-fields.md)). Live-editable scalar fields in Quick Access would require merging the full config bag on every toggle, debouncing, silent toasts, and would race the Settings Formik form. Config mutations that change persisted values should continue to route through `executeAction` + `setPluginConfig` ([ADR 0075](0075-plugin-config-import-actions.md), volume-manager pattern).

## Decision

1. **`quickAccessStatus` on the config schema.** `PluginConfigSchema` may include `quickAccessStatus?: string[]` — field name strings that must exist in `fieldMeta` and `jsonSchema`. Order is display order at the top of the Quick Access panel.
2. **Read-only rendering.** Status fields render from current `pluginConfigs[pluginName]` with controls disabled / non-interactive. They do **not** call `onChange` or `SET_SETTINGS`.
3. **`quickAccess` stays actions-only.** Action ids in `quickAccess` still match `layout` items with `type: "action"`. Mutations (enable/disable, set interval, start/end session) use `EXECUTE_PLUGIN_ACTION`. Plugins may implement config writes inside `executeAction` via merged `setPluginConfig`.
4. **Panel layout order.** `getQuickAccessSchema` builds `layout` as: filtered status field names (in `quickAccessStatus` order), then action elements (in `quickAccess` order). Headings and text-blocks from Settings layout are **not** included in Quick Access.
5. **Allowed status types.** Public scalars only: `boolean`, `number`, `duration`, `enum`, `string`, `percentage`. Skip unknown names, `scope: "private"`, and non-scalars (`object-array`, `checkbox-group`, `string-array`, `remote-select`, etc.).
6. **Menu eligibility unchanged.** A plugin appears in the Quick Access menu only when it has a non-empty resolvable `quickAccess` action list **and** `enabled: true`. Status-only schemas do not qualify.

## Consequences

- Admins see live config context next to run-of-show actions without a second write path.
- Plugin authors declare status once in `fieldMeta`; Settings and Quick Access share labels/formatters.
- Trade-off: toggling a value still requires an explicit action (or Settings), not a checkbox in the panel.
- Trade-off: status reflects broadcast public config; private fields cannot appear in status.

## See also

- [ADR 0074](0074-quick-access-admin-panels.md) — Quick Access actions (still Accepted; actions-only for writes)
- [ADR 0075](0075-plugin-config-import-actions.md) — config mutation via actions
- [ADR 0068](0068-private-scoped-plugin-config-fields.md) — public vs private config
- [`docs/plugins/admin-config.md`](../plugins/admin-config.md) — authoring guide
