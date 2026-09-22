# 0188. Kickstarter campaigns and coin escrow

**Date:** 2026-09-22
**Status:** Accepted

## Context

Kickstarter Account (Spy World) lets a user launch a timed coin campaign with a social
promise (backer rewards). Backers pledge coin; on success the owner is paid; on failure
pledges are returned. After a successful campaign, a delivery-accountability poll can
apply a **Frozen Assets** penalty (`lock` on `coin` for 15 minutes).

Gifts and trades escrow *items*, not coin. There is no ledger hold API. Session-scoped
`GameStateEffect` already defines `lock`, but nothing in production applied it —
shop debuffs use `flag` effects, and coin gating otherwise goes through `earnScale`.

## Decision

1. **Lifecycle lives in `plugin-item-shops/campaigns/kickstarter/`**, not a separate
   package. The item registers in the item-shops catalog; `campaignAccess` on
   `ItemShopsBehaviorDeps` mirrors [ADR 0183](0183-item-use-cross-shop-state-access.md)
   `shopAccess` for starting campaigns from the use handler.

2. **Immediate debit escrow:** pledges call `addScore(..., -amount, { intent: "exact" })`
   and append to Redis-backed campaign state (`context.storage`). Success pays the
   owner the full pledged total (overage kept). Failure refunds each pledge with
   `intent: "exact"`.

3. **One active campaign per room.** Concurrent launches fail without consuming the item.

4. **Timers** use in-memory `BasePlugin` timers for funding and delivery-wait phases, with
   Redis campaign state for restart reconcile (`reconcileOnRegister`). The delivery poll
   window is owned by core `closesAt` ([ADR 0189](0189-poll-closes-at-auto-close.md)).
   Game session end refunds open funding escrow.

5. **Delivery poll** uses core `createPoll` with `closesAt` / `closePoll` / `getPollVotes`
   ([ADR 0152](0152-plugin-authored-core-polls.md), [ADR 0189](0189-poll-closes-at-auto-close.md)).
   Core auto-closes at the deadline; Kickstarter settles on `POLL_CLOSED`. If another poll
   is active at open time, retry briefly then skip the poll (success path — no Frozen Assets).

6. **Frozen Assets** applies `lock` on `coin` for 15 minutes (blocks earns *and*
   spends). This is the first production use of `lock`. Before pledging, reject users
   who already have a coin lock — otherwise a locked debit would silently no-op and
   look like a free pledge.

7. **UI:** `kickstarter-campaign-card` in `aboveChat`; pledges via `EXECUTE_PLUGIN_ACTION`
   `backCampaign`. Campaign launch uses declarative `useForm` ([ADR 0187](0187-declarative-item-use-forms.md)).

## Consequences

- Coin escrow is plugin-owned ledger + storage, not a core hold primitive.
- `lock` on coin is bidirectional; naming (“Frozen Assets”) matches that.
- Restart mid-campaign is recoverable for phase deadlines; in-flight timer callbacks
  still need reconcile.

## See also

- [0042](0042-game-sessions-and-inventory.md) — game sessions / coin ledger
- [0152](0152-plugin-authored-core-polls.md) — plugin-authored core polls
- [0162](0162-economy-scale-for-game-sessions.md) — `intent: "exact"` for spends/refunds
- [0187](0187-declarative-item-use-forms.md) — item launch form
