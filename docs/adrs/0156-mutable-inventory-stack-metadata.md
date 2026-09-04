# 0156. Mutable inventory stack metadata

**Date:** 2026-09-04
**Status:** Accepted

## Context

`InventoryService.giveItem` writes `metadata` once. `InventoryPluginAPI` had no way to change an existing stack's blob. Physical Media condition (ADR 0155) is per-copy state that must update on queue without removing and re-giving the stack.

Storing condition in plugin `context.storage` keyed by `itemId` would duplicate ownership, drift on trade/gift, and miss `USER_GAME_STATE` (inventory items already ship `metadata` to the client).

## Decision

1. **`updateItemMetadata(userId, itemId, patch)`** on `InventoryService` and `InventoryPluginAPI`. Read the hash field, shallow-merge into `item.metadata`, persist, emit `INVENTORY_ITEM_UPDATED` with `{ roomId, sessionId, userId, item }`. Missing `itemId` returns `null` and emits nothing.

2. **Per-stack state belongs in core inventory metadata**, not plugin storage. Opaque `Record<string, unknown>` stays plugin-owned in content; core owns persistence, transfer, and the wire event.

3. **Clients refetch on `INVENTORY_ITEM_UPDATED`.** `userGameStateMachine` treats it like `INVENTORY_ITEM_REMOVED` so condition badges do not go stale until the next unrelated inventory event.

## Consequences

- Plugins can evolve held items (wear, charges, inscriptions) without a second store.
- Shallow merge cannot delete keys; callers must overwrite with an explicit sentinel if they need to clear a field.
- `INVENTORY_ITEM_UPDATED` is user-scoped; subscribers must keep the existing `isMyGameEvent` guard.
- The wire is still a room-wide `RoomBroadcaster` emit (ADR 0008). Physical Media wear fires this on every queue-add; switching inventory events to per-user delivery (`sendUserSystemMessage`'s private channel) is a future ADR.

## See also

- [0042. Game sessions and inventory](0042-game-sessions-and-inventory.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [`packages/server/services/InventoryService.ts`](../../packages/server/services/InventoryService.ts)
