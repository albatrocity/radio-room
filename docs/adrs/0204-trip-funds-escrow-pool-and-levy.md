# 0204. Trip funds: shared escrow pool, proportional levy, and short funds still served

**Date:** 2026-10-02
**Status:** Accepted

## Context

Road trips ([0200](0200-road-trips-v1.md)) need money. Phase 2 adds gas, and later phases add tows and repairs. Hosts asked for two styles. In the first, the room pays without anyone acting, and rich players carry most of it. In the second, the room chips in by choice. Kickstarter ([0188](0188-kickstarter-campaigns-coin-escrow.md)) already had coin escrow, but it lived inside Item Shops and was tangled with campaign state. A second copy in the road-trip plugin would drift: coin locks, CAS retries, and failed-debit rollbacks are easy to get subtly wrong.

We also needed to decide what happens when the room can't pay. A trip that strands because the room is broke is no fun to watch.

## Decision

1. **Shared fund helpers in `@repo/plugin-base` (`helpers/funds.ts`).**
   - `splitProportional(cost, balances)` is pure. Everyone pays the same share of their balance. Shares round down, then the leftover coins go to the largest fractional parts, so the total is exactly `min(cost, Σ balances)` and nobody pays more than they hold.
   - `collectShares(game, { cost, reason, payers, isExempt? })` charges the levy. Users without session state, and users with a coin lock, are left out of both the split and the total. Each payer is debited `min(share, current balance)` with `intent: "exact"`. Whatever falls short is reported as `shortfall`, with no second pass. Payers' reads and debits run concurrently.
   - A debit counts as landed when the balance changed at all. `addScore` applies a delta whole or not at all, so comparing against `before − amount` would misread a concurrent credit as a failed debit and lose track of coins already taken (this applies to pledges too).
   - `EscrowPoolHelper` (storage key plus `addScore` reason) provides `open`, `pledge`, `close`, `refundAll`, `read`, and `clear`.
   - **Only an open pool is ever refunded.** `refundAll({ poolId? })` first claims the pool (open → closed with reason `"refund"`) in one CAS and returns `claimed: false` if it was already closed, so a pool that was settled and paid out, or refunded by a racing caller, is never refunded again. `clear(poolId?)` deletes only that pool, never a newer one.
     - Pledges are written with CAS first, then debited. A debit that doesn't land (coin lock, race) removes exactly that pledge row.
     - `close` returns null for everyone but the first closer, so a pool settles once.
     - The pool never pays anyone. Callers decide what the money buys.
   - `hasActiveCoinLock` and `modifierLocksCoin` move here too, and Item Shops re-exports them.
2. **Kickstarter runs on the pool (amends [0188](0188-kickstarter-campaigns-coin-escrow.md)).**
   - Pledges live in an `EscrowPoolHelper` at `kickstarter:pool`. The campaign record no longer carries `pledges`.
   - On success the owner is paid the pool's `raised` total. On failure or session end, `refundAll` runs.
   - On reconcile, an old campaign that still carries `pledges` is moved into the pool once.
   - A stale open pool is refunded before a new campaign opens. Success settlement is null-safe, so two settlers can't pay out twice.
3. **One `pool-card` web template.**
   - It renders a `PoolCardView` (`title`, `icon`, `eyebrow`, `subtitle`, `bodyLabel`, `body`, `goal`, `raised`, `startedAt`, `endsAt`, `open`, `topContributors`) read from the plugin store at `poolKey`.
   - Pledges send `EXECUTE_PLUGIN_ACTION` with `pledgeAction` and `{ amount }`.
   - Kickstarter (`campaignPool` / `backCampaign`) and the road trip (`tripPool` / `chipIn`) both use it. `KickstarterCampaignCard` is removed.
4. **The trip's fund step (D15–D17).** Parking at a gas site with room in the tank opens a fund. The cost is `gasCost(gallons to full, price, costScale)`, locked when the fund opens. A `fund` blocker holds the van alongside the park. The map's `tuning.funds.mode` sets the default, and admins can switch it with `switchFundsMode` until departure.
   - **Automatic (default):** the levy runs once, in the post-commit effects. Payers are the users online right then. Each payer gets a private notice ("Gas took 1.2% of everyone's wallet. Your share: 3 coins."). The blocker holds for 20 seconds so the room sees the pump.
     - **Claim before charging.** The levy first sets `fund.levyStartedAt` in a CAS, and only then debits anyone; if the fund was already settled or waived, nobody is charged. While a levy has started but not recorded `collected`, `resolveFund` refuses, so an expiring hold or a session end extends the hold (every 3 s) instead of settling it as "0 collected". A levy still unrecorded after 2 minutes is assumed dead and settled without it, with an error logged.
   - **Voluntary:** an `EscrowPoolHelper` at `trip:pool` opens for `tuning.funds.windowMinutes`, and the pool card shows while it's open. `chipIn` is open to everyone, not only admins. Meeting the goal settles the fund early.
5. **A short fund still gets served (D18).**
   - When the fund settles, the van always fills to full.
   - A short fund only changes the copy: the attendant accepts less, with the line picked by seed. Nothing is refunded, nothing reopens, and nothing strands.
   - Ending the game session, `leaveNow`, and `endTrip` settle any open fund first, so the coins and the log always agree.
6. **Fuel is one more prefix sum on the ledger.**
   - Each leg carries `gallonsUsed`, like `mile`.
   - Low and empty are thresholds (`fuel:low` / `fuel:empty`) solved from the ledger and re-armed on every settle, like reveals. Filling up resets the flags.
   - A gas site the van would reach low on fuel defaults to "stop", and its poll copy turns urgent. The live default walks the sites ahead with `skipDefaultsAhead`, using the projected tank.
   - An empty tank starts the Out of Gas incident: a `delivery` fund (fuel to full at a delivery price plus a fee), a short wait, then a fill ([0200](0200-road-trips-v1.md) Decision 12). A van that runs dry at the destination coasts in.
7. **The export records money.** Fund rows (collected, payers, top contributors, with the fill folded in) and a Travelers table of coins paid per listener go into the timeline ([0206](0206-trip-timeline-room-export.md)).
8. **Incident funds (Phase 3).** Incident steps reuse the same fund step with a `purpose` (`roadside`, `tow`, `repair`, `delivery`) and a constant base cost scaled by `costScale`. Automatic levies use the reason `road-trip:<purpose>`, and the voluntary pool uses `road-trip:fund`. The AAA Card part waives the next roadside or tow fee before the fund opens. When the host skips a fund step it is waived and refunded: voluntary pledges go back through the pool, and an automatic levy is credited back to each payer. A fund can't be waived while its levy is still being collected. A voluntary waive claims the pool first; if the deadline already settled it, the waive is refused ("Too late").

## Consequences

- Any plugin can charge the room fairly or open a pool without writing coin code. The pool card works for any `PoolCardView`.
- Kickstarter's behavior is unchanged for players, and its escrow now has the same CAS and rollback guarantees as the trip's.
- Trips never strand for money. The cost of that is that a broke room gets free gas, which is intended.
- Automatic payers are whoever is online when the fund opens. Listeners who join later pay nothing for that stop.
- The fund adds no planned time to the ETA. Live projections include an open fund's hold.
- Per-user fund history stays in the export only. No in-room ledger view yet.

## See also

- [0162](0162-economy-scale-for-game-sessions.md) for `costScale` and `intent: "exact"`
- [0190](0190-durable-plugin-scheduler.md) for fund blocker expiry on the durable scheduler
- [0203](0203-presentation-themes.md) for the `success` and `error` road signs
