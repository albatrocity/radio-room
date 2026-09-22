# 0193. Item-use forms composed with target pickers

**Date:** 2026-09-22
**Status:** Accepted

## Context

[ADR 0187](0187-declarative-item-use-forms.md) introduced `ItemDefinition.useForm` so
items can collect authored values without growing the `requiresTarget` enum. Decision
point 4 said `useForm` takes precedence over `requiresTarget` in `InventoryUseButton` —
a form-only path.

Container items (road case, van cubby, trailer) need both: pick which stacks to store
(`requiresTarget: "inventoryItems"`) and collect password / label / note. Burner phone
and merch cash box need richer field types (`password`, `maxLength`, dynamic option
sources, viewer-derived max) before they can leave their bespoke pickers.

## Decision

1. **Compose when both apply.** When an item declares an entity `requiresTarget`
   (`user`, `queueItem`, `inventoryItems`, `userInventoryItem`, `mediaItem`,
   `storedArtifact`) **and** a non-empty `useForm`, `InventoryUseButton` opens the
   entity picker first, then the declarative form. The use payload includes both the
   target fields and `formValues`.

2. **Form-only unchanged.** Items with only `useForm` (no entity target) keep the
   ADR 0187 path. `"self"` / omitted `requiresTarget` never open a picker.

3. **Legacy input pickers removed.** `coinAmount` and `spokenMessage` are no longer
   `requiresTarget` values. Those flows use `useForm` (with `maxFrom: "coinBalance"`,
   `optionsSource: "mediaBridgeVoices"`, etc.) after the migrations in phase 9c/9d.

4. **Field capabilities (shared with admin actions).** Extend
   `PluginActionFormField` with:
   - `maxLength` for string/textarea (server rejects over-limit; 2000-char fallback)
   - `type: "password"` (masked client input; server validates as string, never logs)
   - `optionsSource: "mediaBridgeVoices"` (client fills select; server does not enum-check)
   - `maxFrom: "coinBalance"` (client caps; item handler remains authority)

5. **Partial supersession.** This **partially supersedes ADR 0187 decision point 4**:
   `useForm` no longer always wins over `requiresTarget`. Entity targets compose with
   the form; form-only and validation rules from 0187 otherwise stand.

## Consequences

- Container and similar items can migrate password/label/note onto `useForm` without
  losing multi-select targeting.
- `InventoryItemStoragePopover` supports an `itemsOnly` mode so the lock step can move
  to the form during migration.
- Core still schema-checks `formValues`; plugins interpret keys they declared.

## See also

- [0187](0187-declarative-item-use-forms.md) — declarative `useForm` (point 4 partially superseded)
- [0045](0045-inventory-item-targeting.md) — `requiresTarget`
