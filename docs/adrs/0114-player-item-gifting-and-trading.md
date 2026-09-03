# 0114. Player item gifting and trading (core inventory protocol)

**Date:** 2026-08-24
**Status:** Partially superseded by [0115](0115-trade-invite-inbox.md) (trade invite inbox, Trades/Gifts tab, mid-session `allowTrading` toggle)

## Context

[ADR 0042](0042-game-sessions-and-inventory.md) established inventory as core infrastructure with `InventoryService.transferItem` as the single trade authority (`ItemDefinition.tradeable` + `GameSessionConfig.allowTrading`). That primitive existed without a player-facing consent protocol, socket surface, or UI — and without Redis locks, so concurrent transfers could race.

Players need two product shapes:

1. **Gift** — one-sided transfer with an acceptance gate (prevents inventory griefing).
2. **Trade** — two-party session with side-by-side offers from both slot pools ([ADR 0100](0100-dual-inventory-slot-pools.md)), dual lock-in, and dual confirm before swap.

Physical Media / collection items are ordinary `InventoryItem` stacks ([ADR 0099](0099-physical-media-personal-libraries.md)); Local grants and `myMedia` follow holdings, so a successful transfer is enough.

We considered hosting this in `@repo/plugin-item-shops` or a new trading plugin. Shopping sessions are plugin-namespaced ([ADR 0049](0049-item-shops-and-shopping-sessions.md)), so other catalogs cannot join without a core refactor. ADR 0042 already rejected a “core game plugin” for the same reason: load-order races and a second mediator.

We also considered a Game State tab for trading ([ADR 0043](0043-game-state-tabs-and-composable-shop-helper.md)). Game State is a personal dashboard (Inventory + plugin tabs + item-detail stack — [ADR 0104](0104-game-state-item-detail-subroute.md) / [ADR 0106](0106-game-state-nav-machine.md)). A trade is a live two-party session; a personal tab fights shop tabs and is invisible unless that modal is open. Declarative plugin JSON cannot host this UI.

## Decision

1. **Core protocol, not a plugin.** Gifting and trading live in `@repo/server` (`GiftService`, `TradeService`, `operations/inventory/*`). Any registered `ItemDefinition` with `tradeable: true` participates. Item Shops is only a catalog source.

2. **Consent + escrow for player sockets.** Plugin `transferItem` remains an immediate primitive. Player sockets never call it without escrow and counterparty acceptance. On offer (gift) or lock (trade), items leave the bag into a Redis pending record so they cannot be used, sold, or double-offered.

3. **Both features gated by `allowTrading`.** No separate `allowGifting`. Default remains `false`; hosts enable via the Start Game Session form.

4. **Gift UI on Inventory rows; Trade in Game State Trades/Gifts tab.** Gift reuses the listener picker (excluding self). Trade invites and active negotiation live in a built-in Game State tab when `allowTrading` is on; drill-down via `GameStateDetailFrame` `{ kind: "trade" }` ([ADR 0115](0115-trade-invite-inbox.md)). ~~Trade opens a dedicated `modalsMachine` state (`trade`)~~ Superseded by 0115.

5. **Slot pools and limits.** `canAccommodateItem` / transfer paths honour dual pools. Accept and swap preflight slot capacity; a full inventory bag does not block a collection gift and vice versa. Net slot math on trade completion accounts for outgoing frees and stackable merges.

6. **Harden `transferItem`.** Self-transfer rejected; Redis per-user locks (`SET NX EX`, sorted user ids); accommodate preflight before debit; accommodate semantics aligned with `giveItem` (merge + new stacks).

7. **Lifecycle.** Pending gifts/trades cancel (refund escrow) on `GAME_SESSION_ENDED` **before** plugin strip, and on user leave/disconnect for that user’s offers and active trade.

8. **Events from operations.** Gift/trade domain events (`GIFT_*`, `TRADE_*`) emit from `operations/inventory/` ([ADR 0014](0014-emit-domain-events-from-operations-only.md)). Completed moves still emit `INVENTORY_ITEM_TRANSFERRED` via inventory.

## Consequences

- Cross-plugin items stay giftable/tradeable without Item Shops coupling.
- Escrow prevents bait-and-switch; refunds on decline/cancel/session end must run before Item Shops strip to avoid spurious recreate-then-wipe.
- Extra modal state for trade is acceptable for a two-party live UI.
- `allowTrading` default false keeps existing rooms unchanged until hosts opt in.

## See also

- [0042. Game sessions and inventory](0042-game-sessions-and-inventory.md)
- [0043. Game state tabs](0043-game-state-tabs-and-composable-shop-helper.md)
- [0049. Item shops and shopping sessions](0049-item-shops-and-shopping-sessions.md)
- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [0100. Dual inventory slot pools](0100-dual-inventory-slot-pools.md)
- [`packages/server/services/InventoryService.ts`](../../packages/server/services/InventoryService.ts)
- [`packages/server/services/GiftService.ts`](../../packages/server/services/GiftService.ts)
- [`packages/server/services/TradeService.ts`](../../packages/server/services/TradeService.ts)
- [`docs/plugins/game-sessions.md`](../plugins/game-sessions.md) — gift vs trade vs plugin `transferItem`
- [0115. Trade invite inbox and Trades/Gifts tab](0115-trade-invite-inbox.md)
- [0147. User inventory peek](0147-user-inventory-peek.md) — counterpart bag/collection read when `allowTrading` (trade UI may adopt later)
