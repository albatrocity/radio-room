# 0149. Timed `inventory_peek` flag and viewer identity pierce

**Date:** 2026-09-02
**Status:** Accepted

## Context

[ADR 0147](0147-user-inventory-peek.md) reserved a future timed viewer flag (`inventory_peek`) as a `canPeekUserInventory` reason so items like X-Ray can authorize peeks after consume, without Black Bag’s peek-before-pay leak.

Separately, Disguise and other games may mask **action attribution** via the core presented-identity grant ([ADR 0150](0150-presented-identity-grant.md)). The listener list always shows the true username. X-Ray should pierce hidden attribution for the viewer without a second socket, using a single client path (`presentedUsername` / system `maskedUserIds`).

## Decision

1. **`INVENTORY_PEEK_FLAG` (`"inventory_peek"`)** — Timed modifier flag on the viewer (e.g. X-Ray item, `visibility: "self"`, neutral intent). Canonical helpers live in `@repo/game-logic` (`hasInventoryPeek`) and are re-exported from `@repo/plugin-base`.

2. **`canPeekUserInventory` policy OR** (extends ADR 0147):
   - trading mode (`allowTrading === true`)
   - actor has active `inventory_peek` (no `itemId` required)
   - item use (`itemId` owned, `requiresTarget: "userInventoryItem"`)

   Peek remains a pure read: defense does not run on peek.

3. **Viewer-side pierce** while `hasInventoryPeek` is true for the current user:
   - **Effect bars:** client does not filter `visibility: "self"` modifiers when rendering another user’s `UserEffectBars`.
   - **System messages:** item-shops attribution that resolves to `"Someone"` may attach `meta.maskedUserIds` (left-to-right). Clients with pierce substitute those labels with real usernames; others keep baked `"Someone"` copy.
   - **Presented-identity masking** (chat author snapshot, system lines, queue `addedBy`, etc. — not the listener list): use `presentedUsername` (and system `maskedUserIds`) with `inventory_peek` so pierce stays automatic. Do not invent a parallel pierce path. See [ADR 0150](0150-presented-identity-grant.md).

4. X-Ray is the first consumer: self-use consumable that applies the flag without a room announce.

## Consequences

### Positive

- One flag gates inventory peek and identity pierce.
- Presented-identity masking ([ADR 0150](0150-presented-identity-grant.md)) can widen attribution surfaces without changing X-Ray’s pierce contract.

### Negative / trade-offs

- Spy-vs-spy: another X-Ray user also sees your `visibility: "self"` bars (including X-Ray itself).
- System-message pierce depends on callers populating `maskedUserIds`; untagged `"Someone"` lines stay opaque.

## Note (2026-09-03)

The masked label in code is **`"Somebody"`**, exported as `PRESENTED_IDENTITY_ANONYMOUS_LABEL` from `@repo/game-logic` (re-exported by `@repo/plugin-base`). The `"Someone"` spellings above describe the intent, not the value — read the constant, never a literal. Item Shops attaches the pierce meta through `sendAttributedSystemMessage`, which also carries `meta.maskedLabel` so pierce does not depend on the default.

## See also

- [0147. User inventory peek](0147-user-inventory-peek.md)
- [0150. Core presented-identity grant](0150-presented-identity-grant.md)
- [0046. Derived modifier flags](0046-derived-modifier-flags.md)
- [`packages/server/operations/inventory/peekUserInventory.ts`](../../packages/server/operations/inventory/peekUserInventory.ts)
