# 0164. Inventory item DOM animations (named catalog)

**Date:** 2026-09-04
**Status:** Accepted

## Context

Physical Media wear already head-shakes collection rows via `data-inventory-item-id` and a
socket binder. Restoration (CD Cleaner / Dust Cloth / Pencil, including broken-SKU conversion)
needed a distinct swell-and-shimmer. Adding another one-off helper would duplicate DOM query,
reduced-motion gating, and binder wiring. Item-targeted motion will keep growing (wear, restore,
and future feedback), so the client needs one declarative catalog.

[ADR 0070](0070-route-transitions-via-view-transitions-api.md) keeps anime.js as the default for
in-page UI; plugin screen effects remain animate.css via `screenEffects.ts`. Neither owns
inventory-row targeting.

In-place condition changes emit `INVENTORY_ITEM_UPDATED` (infer improve/degrade from the ladder).
Conversion wear already sets `degraded` on `INVENTORY_ITEM_REMOVED`. Conversion restore grants a
**new** `itemId` via `giveItem` + `removeItem`, so the client cannot infer restore from UPDATED
alone, and Game State nav drops the broken-item detail frame before the new row mounts.

## Decision

1. **Named catalog.** Client animations for inventory DOM live under
   `apps/web/src/lib/inventoryItemAnimations/`. Callers use
   `playInventoryItemAnimation(itemId, name)` or `playNamedAnimation(element, name)`.
   Each entry supplies `durationMs` and `play(el)`. CSS vs anime.js is an implementation detail of
   the entry (`headShake` → animate.css; `restoreSwell` → CSS keyframes).

2. **DOM targeting.** Mark rows and open item-detail wrappers with `data-inventory-item-id`.
   Do not invent a second attribute. Optional `waitForDomMs` polls until nodes exist (conversion
   restore after nav unmounts the broken detail).

3. **Signals.**
   - In-place wear / restore: compare previous vs next condition on `INVENTORY_ITEM_UPDATED`
     (`isMediaConditionDegraded` / `isMediaConditionImproved`).
   - Conversion wear: `INVENTORY_ITEM_REMOVED.degraded`.
   - Conversion restore: `giveItem(..., options?: { restored?: boolean })` →
     `INVENTORY_ITEM_ACQUIRED.restored`. Shop purchases and ordinary grants omit the flag.

4. **One binder.** `bindPhysicalMediaConditionFx` (bound from `roomLifecycle`) maps those events
   to catalog names. Reduced motion no-ops inside the player.

5. **Queue Add failure** continues to call `playNamedAnimation(button, "headShake")` without an
   item id (playback-device missing reason).

## Consequences

- New item-targeted effects add a catalog entry + binder branch (or event flag), not a parallel
  helper stack.
- `giveItem` gains a seventh optional argument (options), mirroring `removeItem`'s `degraded`
  options bag; recursive remainder grants do not re-emit `restored`.
- Game Studio stays unbound; its `giveItem` accepts unused `_options` for type compatibility.
- Plugin `ScreenEffectName` / `ScreenEffectsProvider` stay separate from this catalog.

## See also

- [0070. Route transitions via View Transitions API](0070-route-transitions-via-view-transitions-api.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [0159. Physical Media restoration items](0159-physical-media-restoration-items.md)
- [0160. Playback-device gating](0160-playback-device-gating.md)
- [`apps/web/src/lib/inventoryItemAnimations/`](../../apps/web/src/lib/inventoryItemAnimations/)
- [`apps/web/src/lib/physicalMediaConditionFx.ts`](../../apps/web/src/lib/physicalMediaConditionFx.ts)
