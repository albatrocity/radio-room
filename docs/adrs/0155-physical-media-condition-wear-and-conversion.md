# 0155. Physical Media condition, wear, and conversion

**Date:** 2026-09-04
**Status:** Partially superseded by [0157](0157-physical-media-condition-artwork.md) (§6 artwork seam)

## Context

Physical Media SKUs derived from the Navidrome library were permanent session holdings. `LocalLibraryGrant.redemption: "durable"` meant `pickGrantToConsume` skipped them, so a record bought once granted unlimited queueing for the rest of the session. There was no wear, no scarcity, and no reason to buy a second copy.

Condition also needs a format key that is independent of `artworkFrame`. A later pass will give Poor copies a visibly scuffed sleeve; if format were inferred from the frame, that change would break conversion mapping.

This amends [ADR 0099](0099-physical-media-personal-libraries.md) §3 (durable redemption is now durable-but-wearing) and §11 (frames are resolved from format + condition, not read raw from the definition).

## Decision

1. **Three-tier condition.** Every Physical Media copy has `metadata.condition` of `"mint" | "good" | "poor"`. Absent metadata reads as `"mint"` for back-compat. Queueing a track off a held playlist/album record in a `metadataSourceAccess.local === "restricted"` room degrades it one tier in `LocalLibraryModule.validateQueueRequest`. Queueing off Poor **always destroys the record**; if the player has a free inventory-pool slot they also receive the matching broken item (Scratched CD / Dusty Record / Tangled Tape). Full inventory is a normal outcome, not an error.

2. **Worst copy first.** When several copies of the same record are held, the worst condition is spent first; ties break on `itemId`. `scope: "library"` grants never wear.

3. **Non-stackable derived SKUs.** Derived Physical Media is `stackable: false, maxStack: 1` so each copy has its own metadata blob. Operator-authored grant rows keep their config-supplied stack flags.

4. **Second rarity axis in the shop.** Offer condition is rolled independently of item rarity (`CONDITION_OFFER_WEIGHTS`: mint 1 / good 2 / poor 4) and scales price (`CONDITION_PRICE_MULTIPLIER`: 1 / 0.7 / 0.45). `ShopEconomyHooks` keep this out of `@repo/plugin-base`. Sellback uses the same multipliers. Broken items list in the Record Store alongside derived records; Green Room keeps Scratched CD.

5. **Admin wear flag.** `GameSessionConfig.physicalMediaWearForAdmins` defaults to `true` and is toggleable mid-session like `allowTrading`. Unrestricted rooms never wear.

6. **`mediaFormat` is the format key.** `ItemDefinition.mediaFormat` (`"CD" | "LP" | "TAPE" | "45"`) is condition-independent. `artworkFrameForFormat(format, condition)` is the seam reserved for per-condition artwork; today all three conditions share the mint frame. *(Superseded by [ADR 0157](0157-physical-media-condition-artwork.md): condition renders as a second prop on that one frame rather than by diverging this table, which keeps the signature but leaves it a passthrough.)* Render sites resolve through that helper (client: `resolveDisplayArtworkFrame`) rather than reading `definition.artworkFrame` directly. Legacy stacks without `mediaFormat` fall back to `formatFromArtworkFrame`.

## Consequences

- Records are consumable stock; the Record Store stays relevant across a session; worn-out media becomes a skip tool rather than dead weight.
- Collection slots fill faster (one copy per slot). Players with a full 3-slot bag still lose Poor records without receiving the broken item.
- ShopPlugin / ShoppingSessionHelper stay format-agnostic via optional economy hooks.
- Restore items, playback-device gating, and per-condition artwork frames are follow-up work on these seams.

## See also

- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [0100. Dual inventory slot pools](0100-dual-inventory-slot-pools.md)
- [0156. Mutable inventory stack metadata](0156-mutable-inventory-stack-metadata.md)
- [0157. Physical Media condition artwork as an overlay modifier](0157-physical-media-condition-artwork.md)
- [0158. Shopping session condition bounds](0158-shopping-session-condition-bounds.md)
- [`packages/plugin-item-shops/localLibrary/condition.ts`](../../packages/plugin-item-shops/localLibrary/condition.ts)
