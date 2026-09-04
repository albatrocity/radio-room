# 0163. The Fed economy controller

**Date:** 2026-09-04
**Status:** Accepted

## Context

[ADR 0162](0162-economy-scale-for-game-sessions.md) gives a session two scale dials. Hosts can set them by hand, but a long show still needs something that watches wealth and moves prices without a human on the admin panel every few minutes.

Putting the controller in `GameSessionService` would make every room run it, couple core to item-catalog statistics, and mix a tuning loop with the ledger. A plugin can be off by default, expose Zod config, and write Quick Access status without a new core service.

`earnScale` is a tempting second automatic lever. Moving both scales together is a change of units (prices and wages inflate in lockstep) and cancels out. One automatic lever is enough for v1.

## Decision

**The Fed** (`@repo/plugin-the-fed`, plugin name `the-fed`) is an optional room plugin that drives **`costScale` only**. `earnScale` stays a manual admin dial.

Default `mode` is `"observe"`: compute and record metrics, never call `setEconomyScale`. Flip to `"adjust"` once `targetAffordability` is calibrated for the room.

Each tick builds an `EconomySample` (participant coin balances from `getEconomySnapshot`, basket price, current scales, net coin flow since the last tick) and calls pure `nextCostScale` in `@repo/game-logic`. In `adjust` mode, when the controller `acted`, the plugin calls `this.game.setEconomyScale`.

**Signal.** Wealth `M` is the configured statistic over session participant balances (default **median** — one whale should not tax the room).

**Basket.** `P₀` is the median `coinValue > 0` from `inventory.getAllItemDefinitions()`, not a shop catalog. Overridable via `basketPriceOverride`.

**Affordability.** `R = M / (P₀ · s)` — "the typical player can afford R typical items." Target `R*` defaults to 3. Ideal scale `s* = M / (P₀ · R*)`.

**Damping** (log space, applied in order): EMA on wealth (λ = 0.3), deadband `|ln(R/R*)| < ln(1+d)` (d = 0.15), geometric smoothing α = 0.25, ±10% step cap, then clamp to `[minCostScale, maxCostScale]`. Hold below `minParticipants` (default 3), with no session, or when `P₀ = 0`.

**Flow.** Net coin per participant per minute is accumulated from `GAME_STATE_CHANGED` and recorded as `flowRatio` for a future wages controller. It is not acted on in v1.

**Observability.** Ring buffer of the last 120 ticks in plugin storage; one `console.info` per tick; `PLUGIN:the-fed:TICK` with `{ invalidatesUserState: false }` (ADR 0154); Quick Access status fields `costScale`, `earnScale`, `affordability`, `wealth`, `flowRatio`, `tickReason`, `participantCount` (ADR 0135). Writing those status fields via `setPluginConfig` must **not** restart the tick timer — `onConfigChange` only reschedules when `enabled`, `tickSeconds`, or `mode` change.

Quick Access actions: Nudge ±10%, Reset to 1.0, Force tick, Export metrics.

## Consequences

- Rooms without the plugin (or with it disabled) keep identity scales; admins can still set dials from Game Sessions.
- Observe mode is the tuning path: run live, read ticks, then flip to Adjust.
- Basket `P₀` jumps when the item catalog's median `coinValue` jumps — authors should keep catalog values on the rarity ladder.
- A second controller on `earnScale` can be added later using the recorded `flowRatio` without changing the ledger split in ADR 0162.

## See also

- [0162. Economy scale for game sessions](0162-economy-scale-for-game-sessions.md)
- [0074. Quick Access admin panels](0074-quick-access-admin-panels.md)
- [0135. Quick Access read-only status](0135-quick-access-read-only-status.md)
- [`packages/game-logic/src/economyController.ts`](../../packages/game-logic/src/economyController.ts)
- [`packages/plugin-the-fed/`](../../packages/plugin-the-fed/)
