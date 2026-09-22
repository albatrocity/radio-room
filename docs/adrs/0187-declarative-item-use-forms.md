# 0187. Declarative item-use forms (`useForm`)

**Date:** 2026-09-22
**Status:** Accepted

## Context

Inventory items that need authored input before use (message text, coin amounts, titles)
historically each required a new `ItemDefinition.requiresTarget` enum value and a bespoke
popover in `InventoryUseButton`. Plugin admin actions already had a shared vocabulary —
`PluginActionFormField` on `PluginActionElement.formFields` — but item use could not reuse it.

Kickstarter Account needs title + goal + rewards in one form. Adding a third one-off
`requiresTarget` would deepen the enum without solving the next item.

## Decision

1. **`ItemDefinition.useForm?: PluginActionFormField[]`** declares fields collected before
   `USE_INVENTORY_ITEM`. The client sends them as `formValues`; plugins read
   `callContext.formValues` in `onItemUsed`.

2. **Extend `PluginActionFormField`** with `type: "number"` plus optional `min`, `max`,
   and `integer`, so admin actions and item use share one schema.

3. **Core validates at `InventoryService.useItem`** via `validateItemUseFormValues`: drop
   unknown keys, coerce/clamp numbers, length-cap strings, fail the use (not consume)
   when required fields are missing or invalid. Never trust client-shaped values alone.

4. **UI:** shared `PluginFormFields` renderer; `ItemUseFormPopover` when `useForm` is set;
   `useForm` takes precedence over `requiresTarget` in `InventoryUseButton`.

5. **`requiresTarget` stays for entity pickers** (`user`, `queueItem`, `mediaItem`, etc.).
   Forms are for authored values, not live-room entity selection.

## Consequences

- New multi-field items ship without core enum growth.
- Admin action forms and item-use forms can share field rendering and validation rules.
- Plugins must still interpret `formValues` keys they declared; core only schema-checks.

## Path forward

Migrate existing input-collecting items onto `useForm` in follow-up work (not required for
Kickstarter). Candidates and missing capabilities:

- **burner-phone** (`spokenMessage`) — needs `maxLength` and dynamic option sources
  (Media Bridge voice list / offline empty state).
- **merch-cash-box** (`coinAmount`) — needs `password` field type and viewer-derived max
  (live coin balance).
- **road-case / van-cubby / trailer** (`inventoryItems`) — only password/label/note can
  move; multi-select stacks need picker-plus-form composition.

Leave on `requiresTarget`: `self`, `user`, `queueItem`, `mediaItem`, `userInventoryItem`,
`storedArtifact`.

## See also

- [0045](0045-inventory-item-targeting.md) — `requiresTarget`
- [0188](0188-kickstarter-campaigns-coin-escrow.md) — first `useForm` consumer
