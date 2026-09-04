# 0162. Economy scale for game sessions

**Date:** 2026-09-04
**Status:** Accepted

## Context

Every coin figure in a Game Session was a literal: `ItemDefinition.coinValue`, plugin rewards, and `ShoppingSessionHelper.purchase` all wrote the authored number straight to the ledger. Long sessions left players sitting on thousands of coins, at which point shops stopped being a game.

Two constraints ruled out a single multiplier on every `addScores` write:

1. **Coin writes are not typed by intent.** `GameSessionService.addScores` is the chokepoint for earns, spends, refunds, escrow returns, and stored-coin withdrawals. Scaling by sign would inflate refunds and double-scale purchases (the debit already carries a scaled price).
2. **Sessions persist as JSON in Redis.** Sessions started before this change have no economy field, so every reader must treat "absent" as scale 1.0.

We considered folding scale changes into `GAME_SESSION_CONFIG_UPDATED`. That event makes every client refetch full user game state, which is too heavy for a routine Fed tick.

Related: [0042](0042-game-sessions-and-inventory.md), [0049](0049-item-shops-and-shopping-sessions.md). Automatic `costScale` driving is a plugin, not core — see [0163](0163-the-fed-economy-controller.md).

## Decision

Authored coin figures are **base values**. Each active session holds an optional `GameSessionConfig.economy`:

- `costScale` — multiplies prices and costs, default 1, clamped `[0.25, 8]`
- `earnScale` — multiplies rewards, default 1, clamped `[0.25, 4]`
- `scaledAttributes` — defaults to `["coin"]`
- `priceRounding` — round scaled prices to this multiple (default 1)

Application is split so each write is scaled at most once:

| Scale | Applied at | Why |
| --- | --- | --- |
| `earnScale` | **the ledger** — inside `addScores`, on positive deltas to `scaledAttributes`, **before** modifiers | Reward-granting plugins inherit it with zero edits. |
| `costScale` | **the quote** — at price resolution, never at the ledger | A purchase debits an already-scaled price exactly once. Affordability, the charged amount, and the compensating refund agree. |

`{ intent: "exact" }` on `addScore` / `addScores` skips earn scaling. Use it for refunds, sell proceeds, cash-box deposit/withdrawal, stored-artifact retrieve, buyout payouts, and custom sellbacks. Negative deltas already skip earn scale.

Shop offers store `basePrice` (unscaled) and `price` (live scaled). `ShoppingSessionHelper.getInstance` re-prices from `basePrice` against the current `costScale` on read. Open shop UIs repaint via `GAME_ECONOMY_SCALE_CHANGED` → `SHOPPING_SESSION_UPDATED`.

Scale changes emit dedicated `GAME_ECONOMY_SCALE_CHANGED` — **not** `GAME_SESSION_CONFIG_UPDATED` — so clients merge the two numbers into the held session config without refetching inventories.

Admin control is `SET_ECONOMY_SCALE` → `AdminService.setEconomyScale`. Plugins use `this.game.setEconomyScale` / `getEconomyScale` / `getEconomySnapshot`.

An item bought at `costScale` 1.0 and sold back at 2.0 pays out more. That is a mechanic, not a bug.

## Consequences

- New reward plugins cannot forget to opt in; they call `addScore` and inherit `earnScale`.
- Call sites that must be literal have to remember `{ intent: "exact" }`. Missing it double-scales refunds. The audit list lives in this ADR and in `docs/plugins/game-sessions.md`.
- Pre-change sessions deserialize as identity. `resolveEconomy(undefined)` is the coercion used everywhere.
- Catalog `coinValue`s are now load-bearing for The Fed's basket (`P₀` = median `coinValue`). Item authors should follow the rarity ladder in `docs/SHOP_ITEM_DEVELOPMENT.md`.

## See also

- [0163. The Fed economy controller](0163-the-fed-economy-controller.md)
- [`packages/game-logic/src/economyScale.ts`](../../packages/game-logic/src/economyScale.ts)
- [`packages/server/services/GameSessionService.ts`](../../packages/server/services/GameSessionService.ts)
