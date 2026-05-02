# 0043. Inventory Item Targeting via `requiresTarget`

**Date:** 2026-05-02
**Status:** Accepted

## Context

[ADR 0040](0040-game-sessions-and-inventory.md) established **`useItem`** and **`onItemUsed`**, with an optional fourth argument **`callContext`**. The socket event **`USE_INVENTORY_ITEM`** only sent **`{ itemId }`**, so **`callContext`** was never populated from the client. Items that should apply an effect to someone other than the inventory owner had no generic wire format or UI.

## Decision

1. Add **`ItemDefinition.requiresTarget?: "self" | "user"`**. When **`"user"`** (or when the UX requires an explicit choice), the inventory UI collects a **`targetUserId`** before emitting **`USE_INVENTORY_ITEM`**.
2. Extend the socket payload to **`{ itemId: string; targetUserId?: string }`**. The rooms controller forwards **`{ targetUserId }`** as **`callContext`** into **`InventoryService.useItem`** → **`onItemUsed`**. Plugins narrow **`callContext`** and validate (e.g. target still in room).
3. The built-in inventory tab uses a reusable **`InventoryUseTargetPopover`** (“Yourself” plus other listeners) when **`requiresTarget === "user"`**.

## Consequences

### Positive

- One generic pattern for targeted consumables without per-plugin socket events.
- Ownership stays with the actor; targeting is explicit and auditable in **`callContext`**.

### Negative / trade-offs

- Plugins must validate **`targetUserId`**; the core does not enforce game rules.
- The union may grow later (`"team"`, etc.); clients and types evolve together.

## References

- [ADR 0040 — Game Sessions and Inventory](0040-game-sessions-and-inventory.md)
- [ADR 0041 — Game State Tabs and Shop Helper](0041-game-state-tabs-and-composable-shop-helper.md)
- `packages/server/controllers/roomsController.ts`
- `packages/server/services/InventoryService.ts`
