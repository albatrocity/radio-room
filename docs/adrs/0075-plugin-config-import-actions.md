# 0075. Schema-Declared Plugin Config Import Actions

**Date:** 2026-07-23
**Status:** Accepted

## Context

Plugins such as Quiz Sessions author list-shaped config (e.g. a private question bank) via schema-driven forms ([ADR 0068](0068-private-scoped-plugin-config-fields.md)). Pasting a bulk bank from a document is faster than row-by-row entry, and admins need that both mid-show (room Quick Access / Settings) and when drafting segments (scheduler).

Quick Access is actions-only ([ADR 0074](0074-quick-access-admin-panels.md)): it must not become a general config editor, but an action may still mutate config from collected input via `executeAction`. The scheduler authors config without a live room plugin instance and must not import individual plugin packages.

Putting paste grammars (e.g. markdown Q&A blocks) in `@repo/utils` would break plugin encapsulation—the format is domain logic owned by the plugin.

## Decision

1. **`configImport` on action elements.** A `PluginActionElement` may include `configImport: { targetField, modes?, sourceParam? }`. `modes` defaults to `["append"]` and may include `"replace"`. The admin UI shows one submit button per mode; the chosen mode is sent as `params.mode` with the paste text (`params[sourceParam]` , default `rawText`).

2. **`textarea` form fields.** `PluginActionFormField.type` may be `"textarea"` for large paste input. Hosts use a Dialog (not a tiny Popover) when an action has `configImport` or any textarea field.

3. **Plugin-owned parsing.** Plugins override `parseConfigImportRows(action, rawText)` on `BasePlugin`. Shared layers do not register named parsers or quiz-specific grammars. `BasePlugin` validates admin + mode, merges rows onto `targetField` (`append` | `replace`), and on live execute calls `setPluginConfig`.

4. **Hybrid hosts.**
   - **Web (Settings + Quick Access):** `EXECUTE_PLUGIN_ACTION` → plugin `executeAction` / `runConfigImportAction` (parse + persist).
   - **Scheduler (and other authoring hosts):** dry-run `POST /api/plugins/:pluginName/config-import` with `{ action, rawText, mode, existingValue }`. The registry resolves the plugin, runs the same parse+merge **without** `setPluginConfig`, and returns `{ success, value, message?, count? }` for the form to apply via `onChange`.

5. **Rejected:** shared named paste parsers in `@repo/utils`; client-side duplication of plugin grammars; expanding Quick Access into arbitrary field editing.

## Consequences

- Future plugins reuse the shell by declaring `configImport` + overriding `parseConfigImportRows`; no per-plugin React modals.
- Domain paste formats stay inside plugin packages; execute and dry-run share one parse implementation.
- Trade-off: authoring hosts need the dry-run HTTP endpoint (auth-gated like the plugin catalog) instead of bundling plugins.
- Quick Access remains actions-only while still supporting config mutation through import actions.
- Example (quiz): question text then `-`/`*` answer lines; blank lines ignored; a new question starts when non-bullet text follows answers.

## See also

- [ADR 0068](0068-private-scoped-plugin-config-fields.md) — private config fields and shared authoring
- [ADR 0074](0074-quick-access-admin-panels.md) — Quick Access panels
- [ADR 0020](0020-plugin-preset-validation-in-repo-utils.md) — scheduler isolation from app/plugin UI bundles
- [`docs/plugins/admin-config.md`](../plugins/admin-config.md) — config schema authoring guide (config import section)
