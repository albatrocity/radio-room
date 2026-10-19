# 0214. Physical media carry on site services and shop entries; trips stop naming catalog shops

**Date:** 2026-10-19
**Status:** Accepted

## Context

A trip author wants a stop that sells records of a certain kind: a honky-tonk with country CDs, a flea market with 45s. Until now a site could only check the Record Store catalog shop ([0206](0206-declared-plugin-capabilities.md), [0207](0207-trip-maps-portable-json.md)), which stocks every derived Physical Media item in the room, plus players. There was no way to narrow the bin by format or genre, and no way to sell records beside custom offers without also pulling in the whole Record Store.

Derived records ([0155](0155-physical-media-condition-wear-and-conversion.md)) carry `mediaFormat` but had no genre. Navidrome already tags albums with genres.

Naming catalog shops from a trip map also coupled maps to Item Shops' shop ids, their rotation rules, and their `onBuy` hooks, which don't apply on the road. Trips have not shipped, so the map format can change without a migration.

## Decision

1. **`PhysicalMediaCarry` is the one filter.** `{ formats?: PhysicalMediaFormat[]; genres?: string[] }` in `@repo/types`, with `matchesPhysicalMediaCarry(definition, carry)`. A record must have a `mediaFormat`; a listed format must match; any listed genre must match case-insensitively. An empty carry (`{}`) matches every record. `physicalMediaCarrySchema` validates it (up to 4 formats, up to 12 genres of 1–60 characters).
2. **Records carry genres.** The bridge daemon merges Navidrome's Subsonic `genre` with OpenSubsonic `genres[].name`, deduped case-insensitively,, and `listLibraryAlbums` returns them as `LibraryAlbumRow.genres` (one shared row type). Derived album items get `ItemDefinition.genres`; a playlist item that shadows an album copies that album's genres. Old DJ Mac packs omit genres, so genre filters match nothing until the pack updates; format-only filters still work.
3. **Shop entries opt in with `physicalMedia`.** `ShopCatalogEntry.physicalMedia?: PhysicalMediaCarry`. `buildEffectiveShopCatalog` appends matching derived records to any shop that declares one (`withPhysicalMediaStock`). The Record Store declares `physicalMedia: {}` and stays a rotation shop; it is only added when the room has derived records. A defined-in-code shop can now sell, say, only LPs.
4. **Trip sites sell records through a service.** `services.physicalMedia` on a site is enough to give it a shop. `siteShopRequest(site)` in `@repo/road-trip-map` turns a site into `{ offers?, physicalMedia? }`, or `null` when it sells nothing. Lint, Road Trip, and studio-bridge all use it. `shop` still holds offers, sample, buyback rate, title, and opening message. A `shop` block with no offers and no service is an `empty-shop` warning.
5. **`shopAccess` takes a carry, not shop ids.** `openRoomShop({ scopeId, title?, offers?, physicalMedia?, buybackRate?, sample?, openingMessage? })` and `validateShop({ offers?, physicalMedia? })`. Every site shop is one composed shop (`offersOnlyShop`): the matched records are its catalog stock with `distinctOffers` (3 distinct picks per traveler), and offers are appended as extras, sampled on their own when `sample` is set. `buybackRate` applies to everything it buys back (default 0). The site's title defaults to the site name.
6. **The scope stores the filter.** `RoomShopScope.physicalMedia` holds the carry, not matched ids, so a late joiner re-matches against the current library.
7. **An unfillable bin is a warning.** `validateShop` warns when the room has no derived records ("Records only sell in rooms on the Media Bridge with a local library") or none match. The map still loads in any room. `openRoomShop` returns `unavailable` when the bin is empty and no offer is sellable, so the stop parks without a shop.
8. **No catalog shop picker.** `shopIds` is gone from the map schema, `shopAccess`, Game Studio, and studio-bridge, along with the per-shop site presets. A generic **Record shop** preset (`services.physicalMedia: {}`, `shop.buybackRate: 0.1`) replaces the Record Store stand. Game Studio's Services section has a "Sells physical media" toggle with format checks and genre chips.

## Consequences

- Authors pick exactly which records a stop sells and can mix them with any offers.
- Shops in code can narrow their record stock with the same filter.
- Genre filters are only as good as Navidrome tags. Studio can't see a room's library, so it can't warn that no "Country" exists; the room warns when the map loads.
- Authors lose one-click catalog shop stands and those shops' `onBuy` hooks on the road. The offer picker still lists every catalog item.
- The Game Studio trip simulator ([0213](0213-game-studio-trip-simulator.md)) still doesn't open real rounds; at a shop stop it posts the opening line and what the shop sells (`describeSiteShop`).
- No `schemaVersion` bump: trips haven't shipped, so there's no migration. A stray `shopIds` key is stripped on parse, and the site gets an `empty-shop` warning if it has nothing else to sell.

## See also

- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [0206. Declared plugin capabilities](0206-declared-plugin-capabilities.md)
- [0207. Trip Maps as portable JSON](0207-trip-maps-portable-json.md)
- [0215. The van shares playback formats while a trip map is loaded](0215-van-shared-playback-formats.md)
