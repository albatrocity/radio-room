# 0180. Tour Laminate: per-copy punch accrual

**Date:** 2026-09-16
**Status:** Accepted

## Context

Nothing in inventory survives a show: `ItemShopsPlugin.handleGameSessionEnded` strips every item-shops stack. The reusable stash (ADR 0179) makes a collectible that *wants* to cross months possible. The Tour Laminate is that collectible: it accrues one punch per show it is present for.

`InventoryService.giveItem` merges stackable items and silently discards incoming metadata on the merge path (ADR 0155 §3). Punch history is per-copy metadata, so the laminate must not stack.

Redemption — what a punched laminate unlocks — is undefined. Accrual is the whole feature.

## Decision

1. **Accrue on `INVENTORY_ITEM_ACQUIRED`**, not on use. That covers host grants today and a future shop listing without a second hook. `updateItemMetadata` emits `INVENTORY_ITEM_UPDATED`, so there is no recursion.

2. **Idempotence is on the item, not the user.** Passing a laminate around within one show cannot farm punches; `transferItem` already copies metadata.

3. **Idempotence key:** `show:<showId>` if the room has a show, else `session:<sessionId>`, else no punch. Dedupe if **either** `showId` or `sessionId` matches an existing punch, so attaching a show mid-session cannot double-punch.

4. **Coin ladder** `[5, 10, 20, 35, 55, 80]`, flat at 80 from punch 6. `addScore(..., "tour-laminate:punch")` **omits** `{ intent: "exact" }` — a punch is an earn and inherits `earnScale` (ADR 0162). History stores the **base** (pre-scale) amount. This is the opposite of cash-box escrow / stored-artifact retrieve, which use `exact`.

5. **`stackable: false`, `maxStack: 1`, `consumable: false`.** No Use button, no shop listing (host-granted). `rarity: "legendary"`, `coinValue: 100`, `detailView.layout: "punchCard"` — a new `ItemDetailViewLayout` value, which ADR 0104 already allows without per-plugin routers.

6. **History cap 25** (newest last) because stack metadata ships on every `USER_GAME_STATE`. `tourPunchCount` is monotonic and survives trimming. Total punches and current streak are derived from history; there is no separate streak counter.

7. **Each punch snapshots the holder** (`holderUserId`, `holderUsername`). `userId` regenerates each session, so the punch-card itinerary displays the **true username** from `getUsersByIds` (not presented identity — this is item history, not a room line). A later holder does not rewrite earlier rows.

8. **Session-end destruction is the mechanic.** No exemption from `stripOwnedItemsFromAllUsers`. Forgetting to stash wipes the copy, punches included. Green Room's `onSessionEnd` confiscation can still grab a laminate for a 5-minute return into a stripped session (pre-existing; newly visible). Excluding legendary items from that roll is a follow-up, not part of this decision.

9. **Redemption is an explicit non-decision.** Do not add a `use` handler, shop listing, or unlock table opportunistically.

## Consequences

- The stash (ADR 0179) is the only way to land a second punch.
- Two laminates in one show each punch independently (per-copy).
- Game Studio's mock `getRoom()` has no `showId`, so studio play exercises the `session:` fallback — but only after inventory lifecycle emits `INVENTORY_ITEM_ACQUIRED` (previously missing).

## See also

- [0104. Game State item detail](0104-game-state-item-detail-subroute.md)
- [0156. Mutable inventory stack metadata](0156-mutable-inventory-stack-metadata.md)
- [0162. Economy scale](0162-economy-scale-for-game-sessions.md)
- [0179. Reusable password stashes](0179-reusable-multi-slot-password-stashes.md)
