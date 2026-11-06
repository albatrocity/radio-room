# 0228. Trip books, the Gas Canister, and one-shot weighted poll votes

**Date:** 2026-11-02
**Status:** Accepted

## Context

Road trips needed more things to buy at stops. Food items fit the existing Item Shops pattern (timed modifiers and text effects), but three of the new items reach into systems that had no hook for them:

- A **Gas Canister** adds fuel. Until now only a fund (a gas stop, a levy, or the Out of Gas delivery) changed the tank, and every fill brought it to full ([0205](0205-road-trips-v1.md), [0220](0220-trip-events.md)).
- **Books** give a buff for the rest of the trip. Some help the reader (coin gains, shop prices). Others change how the van handles incidents (jams, breakdowns), and the room should hear who made the difference.
- A **Pizza Slice** doubles your next poll vote. Core polls ([0061](0061-poll-voting-as-core-feature.md)) counted one vote per user.

## Decision

1. **Items compose onto stops, not shops.** The new food items live in Item Shops' catalog but are listed in no catalog shop. Trip authors add them to a site's `shop.offers` by `definitionId` (for example `item-shops:coffee`, `road-trip:gas-canister`), as in [0207](0207-trip-maps-portable-json.md).
2. **Gas Canister** (`road-trip:gas-canister`, `@repo/road-trip-map` `GAS_CANISTER`): only while driving. It pours its gallons into the tank, capped at the tank size, and moves `lastFill` the way `resolveFund` does, so the ledger and the refill gauge ([0219](0219-road-trip-van-motion-and-refill-window.md)) follow. It is refused (kept) on a full tank or once the tank is dry. It never resolves an incident or a fund and never skips a stop. Pouring above the low line clears the `low` flag, so it can fire again.
3. **Books are trip-scoped.** A book can be read while the trip is `loaded` or `driving`; off a trip it stays in the bag. Each book belongs to a series and has a level (`TRIP_BOOKS`, `readOutcome`):
   - Your level is the highest book of the series you understood this trip (`TripState.books[series][userId]`).
   - A book at or below your level is refused and kept ("You already know this stuff.").
   - The next level is spent and replaces the lower buff.
   - A level further ahead is spent for nothing ("All of this stuff kind of went over your head.").
   - Different series stack.
4. **Two book scopes.**
   - **Reader** books (Investment Advice, Negotiating for Dummies) apply a `road-trip-book:{series}` timed modifier through a `book-buff` effect. Trip exits (`closeOpenWork`) emit `forget-books`, which removes them. The modifier's duration is only a backstop.
   - **Van** books (Defensive Driving, Basics and Advanced Automobile Mechanics) are trip knowledge. `compileEventSteps` takes `knowledge`: a jam crawls at no worse than ×0.5, and engine-family waits scale by 0.75 or 0.5. The opening incident sign credits the readers at the level in effect ("Doug and Sam read …"), but only when `knowledgeCredit` finds that the knowledge changed the steps. So when the horn's ×0.55 wins, no one is named.
5. **Multipliers scale positive gains only.** `evaluateModifiers` applies multipliers to amounts above zero and skips `{ exact: true }` (refunds, purchases, transfers). Investment Advice's ×1.1 can't inflate spends or mint coins through transfers.
6. **A shop price modifier.** `SHOP_PRICE_ATTRIBUTE` (`shop:price`) multipliers scale the buyer's shop prices. `ShoppingSessionHelper.getInstance` applies them on read, so the shelf price and the charged price always match. Sellback and pledges are unchanged, and a price never drops below 1.
7. **One-shot weighted votes.** The Pizza Slice sets a `double_vote` flag modifier (one at a time, refused while a charge is waiting). On a user's first vote in an open poll, `castVote` spends the charge and stores weight 2 in `room:{roomId}:poll:{pollId}:weights`. The live total, the close tally, and plugin tallies all sum weights. Changing the vote keeps the weight.
8. **Use label.** `ItemDefinition.useLabel` (optional, at most 20 characters) renames the inventory Use button; books say "Read".

## Consequences

- Fuel can now change outside a fund. Anything that reasons about fills should read `lastFill`, not assume a full tank.
- `TripState.books` and the `book-read` log entry are new optional fields; old trips load unchanged.
- Coin multipliers no longer affect negative amounts or exact credits. No existing modifier depended on that.
- Poll results can total more than the number of voters. Weights are per poll and are deleted with the poll's keys.
- The van-book credit relies on comparing compiled steps, so a new knowledge effect needs a family-to-series entry in `knowledgeCredit`.

## See also

- [0205. Road trips v1](0205-road-trips-v1.md)
- [0220. Trip events](0220-trip-events.md)
- [0061. Poll voting as a core feature](0061-poll-voting-as-core-feature.md)
- [0054. Text effect kind pattern](0054-text-effect-kind-pattern.md)
