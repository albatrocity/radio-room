# 0100. Dual inventory slot pools

**Date:** 2026-08-17
**Status:** Accepted (amended by [0160](0160-playback-device-gating.md) — third `"playback"` pool)

## Context

Game sessions expose a single inventory cap (`maxInventorySlots`, default 3). Physical Media ([ADR 0099](0099-physical-media-personal-libraries.md)) is meant to accumulate as a collection; three shared slots would force players to drop tools to keep records.

Keeping records as `InventoryItem`s still matters: grant resolution, shop purchase, and a future transfer event all already operate on stacks. A second item type or parallel store would duplicate that path.

## Decision

1. **`ItemDefinition.slotPool`:** `"inventory"` (default) or `"collection"`. Physical Media (durable playlist grants) uses `"collection"`; Library Card and other consumables stay `"inventory"`.
2. **Session cap:** `GameSessionConfig.maxCollectionSlots` (default 12) sits beside `maxInventorySlots`. `UserInventory.maxCollectionSlots` mirrors the session value.
3. **Enforcement:** `InventoryService.canAccommodateItem` / add-item paths count occupied slots **per pool**. A full inventory bag does not block a collection purchase, and vice versa.
4. **UI:** The Inventory tab renders the bag with empty-slot placeholders up to `maxInventorySlots`. The Collection area appears only once the user holds a collection item and lists held rows without placeholders, since a mostly empty 12-slot grid reads as broken rather than aspirational. Admins set both caps on the Start Game Session form.

## Consequences

- Collection capacity can grow without loosening the consumable bag.
- Call sites that construct `UserInventory` or `GameSessionConfig` must include `maxCollectionSlots`.
- Session-end still strips both pools for Item Shops items; “collection” is not persistent across games.
- [ADR 0160](0160-playback-device-gating.md) widens `slotPool` with `"playback"` and adds
  `maxPlaybackSlots` (default 2). `resolveSlotPool` is the shared normalizer for the three-way union.

## See also

- [0042. Game sessions and inventory](0042-game-sessions-and-inventory.md)
- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [0160. Playback-device gating](0160-playback-device-gating.md)
- [`packages/server/services/InventoryService.ts`](../../packages/server/services/InventoryService.ts)
