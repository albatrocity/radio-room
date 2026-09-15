# 0176. Room shop assignment rarity overrides

**Date:** 2026-09-15
**Status:** Accepted

## Context

[ADR 0175](0175-item-shop-themes-and-assignment-rarity.md) fixed catalog assignment rarities
(common / uncommon / rare / legendary) so everyday shops dominate a full rotation. Hosts already
narrow the pool with `enabledShopIds`, but live shows still need **on-the-fly re-weighting**
(e.g. bump Spy World to common for one segment) without editing shop modules or waiting for a
deploy. Overrides must be room-scoped and ephemeral enough to change between shopping rounds;
long-term Postgres persistence is unnecessary.

## Decision

1. **Sparse config map** — Item Shops config gains `shopRarityOverrides: Record<shopId, ItemRarity>`
   (default `{}`). Stored in the existing room plugin Redis config key
   (`room:{roomId}:plugins:item-shops:config`, ADR 0003 / 0068). Catalog
   `ShopCatalogEntry.rarity` remains the source of truth when a shop id is absent from the map.

2. **Admin UI** — The `enabledShopIds` checkbox-group gains an optional per-row rarity `<select>`
   via `PluginFieldMeta.optionSelect` (sibling field `shopRarityOverrides`). Selecting the catalog
   default for a shop **deletes** that key (sparse). The sibling field is **not** listed in
   `layout`. Changes apply on the next `startSession` / mid-round join assignment; open instances
   are not rewritten.

3. **Assignment stamp** — `getEligibleShops` calls `applyShopRarityOverrides` after enable /
   controller / room-type filters so `pickWeightedShop` sees effective rarities. Unknown shop ids
   and non-enum values are ignored.

4. **Presets** — Exporting a plugin preset or authoring a scheduler segment may copy the map.
   Empty `{}` preserves catalog behavior; document that room tuning can travel with an explicit
   preset. A separate plugin-storage key was rejected to keep one Formik save path.

## Consequences

- Hosts can re-weight shops between rounds from Settings without code changes.
- An explicit override wins over a later catalog rarity change until the host resets that select
  to the (new) default.
- Preset/segment copy can accidentally persist show-specific tuning into Postgres; default empty
  map and docs mitigate this.

## See also

- [ADR 0175](0175-item-shop-themes-and-assignment-rarity.md) — catalog themes and assignment rarity
- [ADR 0049](0049-item-shops-and-shopping-sessions.md) — shopping sessions
- [ADR 0068](0068-private-scoped-plugin-config-fields.md) — schema-driven config / Redis split
- [`packages/game-logic/src/shoppingSessionCatalog.ts`](../../packages/game-logic/src/shoppingSessionCatalog.ts)
  (`applyShopRarityOverrides`, `pickWeightedShop`)
