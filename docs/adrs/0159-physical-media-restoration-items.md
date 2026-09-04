# 0159. Physical Media restoration items

**Date:** 2026-09-04
**Status:** Accepted

## Context

[ADR 0155](0155-physical-media-condition-wear-and-conversion.md) made Physical Media a one-way wear
ladder (`mint → good → poor → converted`) and listed restore items as follow-up work. Conversion
destroys a Poor copy and, when inventory has a free slot, grants a broken-media SKU (Scratched CD /
Dusty Record / Tangled Tape). Those SKUs were stackable (`maxStack: 3`), so `InventoryService.giveItem`
dropped per-copy metadata when merging into an existing stack — origin tracking for a later restore
was unreliable.

Nothing in the inventory UI could target a collection-pool stack. `requiresTarget: "inventoryItem"`
exists for Van Cubby storage and already sends `targetInventoryItemId`, but its picker filters out
storage items and is password-gated. Restoration needs a different picker over **every** stack the
player holds, inventory and collection alike, without teaching the player which targets are valid.

## Decision

1. **`requiresTarget: "mediaItem"` reuses `targetInventoryItemId`.** Collection items are ordinary
   `InventoryItem`s distinguished only by `slotPool: "collection"`. The new picker is unfiltered
   (excluding only the acting stack) and the handler decides whether the target was valid. The
   `USE_INVENTORY_ITEM` payload and rooms-controller / studio-bridge forwarding are unchanged.

2. **The wear ladder is reversible at a cost.** `degradeCondition` and `restoreCondition` share one
   declarative table in `localLibrary/condition.ts` so they cannot disagree about ordering.
   CD Cleaner services `CD`, Dust Cloth services `LP` and `45`, Pencil services `TAPE`. Each takes a
   matching copy up one condition level. Wasted uses (Mint, wrong format, a pedal) return
   `{ success: false, consumed: true }` so the cleaner is lost and the actor sees the Error toast.

3. **Broken media is non-stackable** (`stackable: false, maxStack: 1`). Each converted copy occupies
   its own inventory slot with its own metadata blob. Conversion writes
   `metadata.mediaOrigin` (`PHYSICAL_MEDIA_ORIGIN_KEY`) with the definitionId of the record that
   wore out. That also throttles acquisition of a skip-current-track effect and makes the existing
   "no room to keep it" branch a real 3-slot-bag outcome. Legacy stacks with `quantity` 2–3 keep
   working; missing origin takes the random-restore path. No migration.

4. **Restore of a matching broken SKU** consumes it and grants a `poor` copy of a record. Prefer
   `mediaOrigin` when that definition is still registered. Otherwise pick at random from
   `getAllItemDefinitions()` filtered to collection-pool Physical Media whose `mediaFormat` is in
   the intersection of the cleaner's formats and the broken SKU's formats (Dusty Record serves both
   `LP` and `45`). Shop-bought broken media therefore restore to _some_ matching record from the
   room's derived library. `giveItem` runs before `removeItem`; a full collection aborts without
   consuming the cleaner or the broken copy.

5. **The unfiltered picker is a discovery mechanic.** Item descriptions stay in character and do not
   name the pairing. Players find out what each cleaner does by guessing.

## Consequences

- Wear and restoration stay consistent because they share one table; XState is not used for this
  synchronous lookup.
- Broken-media skips are harder to stockpile (one slot each). Rooms that already hold stacked
  copies are unaffected besides lacking origin metadata.
- Players can waste a cleaner on the wrong target; that is intended.
- `"mediaItem"` extends the [ADR 0045](0045-inventory-item-targeting.md) union without a new wire
  field. Clients that do not handle the variant still render a plain Use button that omits
  `targetInventoryItemId`, which the handler rejects without consuming.

## See also

- [0045. Inventory item targeting via `requiresTarget`](0045-inventory-item-targeting.md)
- [0100. Dual inventory slot pools](0100-dual-inventory-slot-pools.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [0156. Mutable inventory stack metadata](0156-mutable-inventory-stack-metadata.md)
- [`packages/plugin-item-shops/items/shared/restoreMedia.ts`](../../packages/plugin-item-shops/items/shared/restoreMedia.ts)
