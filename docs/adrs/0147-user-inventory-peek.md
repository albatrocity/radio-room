# 0147. User inventory peek (private by default)

**Date:** 2026-09-02
**Status:** Accepted

## Context

Player inventories are private: each client only receives its own stacks via `USER_GAME_STATE` ([ADR 0097](0097-plugin-contribute-to-user-game-state.md)). Two product needs require a controlled read of another listener's holdings:

1. **Targeted item use** that picks a stack on another user (e.g. Black Bag steal) needs a peek before `USE_INVENTORY_ITEM` with `targetUserId` + `targetInventoryItemId`.
2. **Trading** ([ADR 0114](0114-player-item-gifting-and-trading.md) / [0115](0115-trade-invite-inbox.md)) may later show a counterpart's bag/collection before an invite and during a session; today trade UI only shows offers.

A Black-Bag-only peek would duplicate the wire surface. Inventories should stay private by default, with explicit exceptions for item use, trading mode, and timed viewer items (see [ADR 0149](0149-inventory-peek-flag-and-identity-pierce.md)).

## Decision

1. **Private by default.** Clients cannot read another user's inventory unless a core policy check passes.

2. **Core socket** `PEEK_USER_INVENTORY { targetUserId, itemId? }` → same-socket `USER_INVENTORY_PEEK_RESULT`. Not a plugin action. Payload is hydrated public catalog fields per stack (`itemId`, `definitionId`, `name`, `icon`, `imageUrl`, `artworkFrame`, `rarity`, `shortId`, `tradeable`, `slotPool`, `quantity`). Omit stack `metadata`. Return **both** slot pools ([ADR 0100](0100-dual-inventory-slot-pools.md)).

3. **Policy OR** in `canPeekUserInventory` (extensible without a new socket):
   - **Item use:** actor owns `itemId` whose definition has `requiresTarget: "userInventoryItem"`.
   - **Trading mode:** active session `allowTrading === true` and target is another in-room user.
   - **Timed viewer flag:** `inventory_peek` on the actor — implemented in [ADR 0149](0149-inventory-peek-flag-and-identity-pierce.md).

   The pure policy predicate lives in `evaluatePeekPolicy` (`@repo/game-logic`) so both the production server and the Game Studio bridge share identical rules without duplicating them. The async data-fetching wrapper `canPeekUserInventory` remains in `packages/server/operations/inventory/peekUserInventory.ts`.

4. Always require: active game session, target ≠ actor, target in room. When trading is off, `itemId` is required for the item-use branch (unless the actor has an active `inventory_peek` flag).

5. Extend **`ItemDefinition.requiresTarget`** with **`"userInventoryItem"`**: inventory UI picks a user, peeks, then picks a stack and sends `targetUserId` + `targetInventoryItemId` with `USE_INVENTORY_ITEM` ([ADR 0045](0045-inventory-item-targeting.md)).

6. **Defense does not run on peek.** Items that steal or otherwise mutate inventory after a peek still go through `applyTimedModifier` / existing defense scopes so Warranty / Honeypot / Rubber Band can block the **use**, not observation ([ADR 0053](0053-targeted-item-use-defense-intercept.md)).

## Consequences

### Positive

- One peek primitive for burglar items, trading UX, and timed viewer items (X-Ray).
- Hosts who enable trading opt into visible bags; default sessions stay private.
- `evaluatePeekPolicy` in `@repo/game-logic` is the single authoritative source of peek rules; future policy changes (new reasons, new flag names) are made in one place.

### Negative / trade-offs

- Trading-on reveals inventories (including defenses) before invites — intentional game-mode exception.
- Peek hydrates definition fields so viewers are not limited to their own `itemDefinitions` filter.

## See also

- [0045. Inventory item targeting](0045-inventory-item-targeting.md)
- [0114. Player item gifting and trading](0114-player-item-gifting-and-trading.md)
- [0053. Defense-triggered callbacks](0053-targeted-item-use-defense-intercept.md)
- [0149. Timed `inventory_peek` flag and viewer identity pierce](0149-inventory-peek-flag-and-identity-pierce.md)
- [`packages/game-logic/src/peekUserInventoryPolicy.ts`](../../packages/game-logic/src/peekUserInventoryPolicy.ts)
- [`packages/server/operations/inventory/peekUserInventory.ts`](../../packages/server/operations/inventory/peekUserInventory.ts)
