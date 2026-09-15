# 0175. Item shop themes and assignment rarity

**Date:** 2026-09-15
**Status:** Accepted
**Partially supersedes:** [0168](0168-beat-detector-now-playing-info.md) (Beat Detector shop placement only),
[0169](0169-vu-meter-now-playing-overlay.md) / [0171](0171-chromatic-tuner-now-playing-info.md)
(consequences that place Beat Detector at Spy World)

## Context

Item Shops grew five distinct storefronts (Farmer's Market, Sweetwater, Green Room, Spy World,
Record Store) without a written taxonomy. New SKUs were listed wherever felt fun, which put the
Beat Detector (a radio gear toy) at Spy World and Disguise at both Green Room and Spy World.
Shopping-round assignment was uniform among `enabledShopIds`, so high-impact shops (Spy World)
appeared as often as produce stalls.

Hosts already filter with `enabledShopIds`. Assignment should still bias toward everyday shops
when the full set is enabled, using the same rarity ladder as item offers.

## Decision

1. **Shop themes** (documentation + authoring skills; not a runtime field):
   - **Farmer's Market** — inconsequential produce letter treatments (chat color/shape flair).
   - **Sweetwater** — toys and gear gadgets; pedals and radio toys usable on self or others
     (including mildly nefarious chat mischief).
   - **Green Room** — queue manipulation and long-term storage (fridge snacks, passworded
     cubbies / cash boxes, Mars Egg).
   - **Spy World** — game-altering sneaky tools (steal, peek, disguise, rebound defenses).
   - **Record Store** — Physical Media and playback capability (derived records, broken SKUs,
     cleaners, devices).

2. **Catalog moves**
   - Beat Detector sells at **Sweetwater only** (same rare / 50-coin listing; still
     `availableInRoomTypes: ["radio"]`).
   - Disguise is **delisted from Green Room**; Spy World remains its home.

3. **Documented stretches** (left in place intentionally): Warranty and 9V Battery at Sweetwater;
   Private Bathroom and Buyout at Green Room. Pedals stay at Sweetwater (not Farmer's Market).

4. **Assignment rarity** — `ShopCatalogEntry.rarity?: ItemRarity` (omit = `common`). Shopping
   rounds pick among the eligible pool (`enabledShopIds` ∩ controller / room-type filters) with
   `DEFAULT_RARITY_WEIGHTS` (common 4 / uncommon 3 / rare 2 / legendary 1) via `pickWeightedShop`.
   Catalog defaults:
   - Record Store, Farmer's Market, Sweetwater: **common**
   - Green Room: **rare**
   - Spy World: **legendary**
   No second layer that preserves absolute rates when shops are disabled; relative weights among
   the remaining pool are enough.

5. **Authoring** — New items: suggest one matching shop (or offer a new shop). New shops: require
   a thematic description and an assignment rarity. Themes live as comments on shop modules;
   skills and `docs/SHOP_ITEM_DEVELOPMENT.md` carry the taxonomy.

## Consequences

- Spy World and Green Room appear less often in a full rotation; hosts who want them frequently
  uncheck common shops.
- Sweetwater shares the common tier with Record Store and Farmer's Market (~equal weight when
  all three are eligible).
- Beat Detector placement aligns with Oscilloscope / VU Meter / Chromatic Tuner at Sweetwater.
- Theme mismatches still require judgment for stretches; ADR audit names the known ones.

## See also

- [ADR 0049](0049-item-shops-and-shopping-sessions.md) — shopping sessions
- [ADR 0168](0168-beat-detector-now-playing-info.md) — Beat Detector visuals (shop moved here)
- [ADR 0176](0176-room-shop-assignment-rarity-overrides.md) — room-scoped admin rarity overrides
- [`docs/SHOP_ITEM_DEVELOPMENT.md`](../SHOP_ITEM_DEVELOPMENT.md)
- [`packages/game-logic/src/shoppingSessionCatalog.ts`](../../packages/game-logic/src/shoppingSessionCatalog.ts)
  (`pickWeightedShop`, `ShopCatalogEntry.rarity`)
