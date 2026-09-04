# 0158. Shopping Session Condition Bounds

**Date:** 2026-09-04
**Status:** Accepted

## Context

[ADR 0155](0155-physical-media-condition-wear-and-conversion.md) rolls Record Store offer condition independently of item rarity (`CONDITION_OFFER_WEIGHTS`: mint 1 / good 2 / poor 4). Hosts need to clamp that roll for a given shopping round — for example only Mint copies, or only beaters — without changing wear-on-queue or sellback math.

Shopping rounds are owned by Item Shops ([ADR 0049](0049-item-shops-and-shopping-sessions.md)). Game-session config already has `physicalMediaWearForAdmins`; putting offer bounds there would mix shop-stock policy with session rules and would not apply to auto-shop ticks that only read plugin config.

## Decision

1. **Bounds live on Item Shops plugin config**, not `GameSessionConfig`. Public fields `offerConditionMin` (worst allowed, default `"poor"`) and `offerConditionMax` (best allowed, default `"mint"`) bound Record Store Physical Media offers only. Broken SKUs and non-PM shops are unchanged.

2. **Closed wear-rank interval.** Allowed conditions are every `MediaCondition` whose `CONDITION_WEAR_RANK` lies between the two endpoints, inclusive. An inverted pair (min Mint, max Poor) still yields the full ladder. Weights among the allowed set are the existing `CONDITION_OFFER_WEIGHTS`, renormalized.

3. **Apply at offer build time.** `decorateOffer` reads current bounds when `ShoppingSessionHelper` builds instances. Changing config does not rewrite open offers; the next Start / auto-shop / join assignment uses the new range.

4. **Quick Access is actions-only for writes** ([ADR 0074](0074-quick-access-admin-panels.md), [ADR 0135](0135-quick-access-read-only-status.md)). The two fields appear as read-only status. `setOfferConditionRange` persists them via `executeAction` + `setPluginConfig`. Settings still edits them as enum fields.

## Consequences

- Hosts can run a Mint-only bin or a Poor-only dump without a code change; auto-shop inherits the same range.
- Open rounds stay as rolled until the next session start.
- Trade-off: two independent enums can be inverted; we treat that as a span rather than a validation error so Quick Access cannot wedge a round.

## See also

- [0049. Item shops and shopping sessions](0049-item-shops-and-shopping-sessions.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [`packages/plugin-item-shops/localLibrary/condition.ts`](../../packages/plugin-item-shops/localLibrary/condition.ts)
