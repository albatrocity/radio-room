# 0098. Inventory-scoped Local library catalog filters

**Date:** 2026-08-17
**Status:** Accepted

## Context

Media Bridge rooms can mark the Local (`local`) metadata source **restricted** so only admins and plugin grants may search or queue ([ADR 0088](0088-metadata-source-access-grants.md)). Item Shops already sells a Thrift Store Coupon that unlocks Local. Operators also want **curated shelves** (Bargain Bin, Out Of Print, Local Heroes, Unreleased) without editing ID3 tags or exposing Navidrome playlists as a user-facing browse/search mode.

[ADR 0089](0089-metadata-source-content-browse.md) kept genres/playlists out of **product** browse (artists → albums → tracks only). That constraint remains: listeners never search or browse “by playlist.” Playlists are operator tooling for **membership sets** that filter the same hierarchy.

## Decision

1. **Catalog grant on items:** `ItemCatalogEntry.localLibraryGrant` is either `{ scope: "library" }` (full Local catalog) or `{ scope: "playlist"; playlistKey: string }` (abstract shelf key).
2. **Config map:** Item Shops admin config maps each `playlistKey` to a Navidrome playlist id (`playlistIdBargainBin`, …). Unmapped keys contribute nothing (fail closed for that shelf).
3. **Access:** Holding any resolved grant (full library **or** at least one mapped playlist) yields `grantMetadataSourceAccess` for `local`. Admins and `open` Local remain unfiltered and do not consume inventory.
4. **Invisible filter on RPC:** When Local is restricted and the user has only playlist-scoped grants, search/browse/getTrack carry `playlistIds`. The bridge daemon caches `getPlaylist` membership (track/artist/album id sets, TTL ~45s) and:
   - **Search:** `search3` ∩ track set
   - **Browse:** build artist/album indexes **from the playlist outward** (not full `getArtists` then filter)
   - **Album detail:** omit tracks outside the set
5. **Full-library grants** (coupon or admin): omit `playlistIds` — no playlist path.
6. **Consume on queue:** Prefer a shelf Sticker whose playlist contains the track; otherwise redeem the full-library coupon. Shelf-only users cannot queue tracks outside their union (validation rejects).
7. **No client playlist vector:** Do not add playlist tabs, playlist search, or playlist ids on `EFFECTIVE_METADATA_SOURCES` / browse capabilities.

## Consequences

- Operators curate shelves in Navidrome’s UI; Listening Room only stores playlist ids.
- Shelf browse cost scales with playlist size, not full library size.
- ADR 0089’s “playlists out of scope” means **user-facing browse-by-playlist**; inventory-scoped membership filtering is in scope here.
- Oversized playlists that mirror the whole library should use the legendary Coupon instead (or be split).

## Ops runbook

1. In Navidrome, create playlists named for ops clarity (e.g. Bargain Bin, Out Of Print, Local Heroes, Unreleased). Keep them selective (hundreds–low thousands of tracks).
2. Copy each playlist’s id from the ND UI / Subsonic API.
3. In room admin → Item Shops, paste ids into:
   - Navidrome playlist id — Bargain Bin
   - Navidrome playlist id — Out Of Print
   - Navidrome playlist id — Local Heroes
   - Navidrome playlist id — Unreleased
4. Set Content → Media sources → Library to **Admins + plugin grants only**.
5. Stock/rotation: Thrift Store (bridge-only) sells the four Stickers plus Thrift Store Coupon (legendary full library) and Scratched CD.

## See also

- [0088. Metadata source access grants](0088-metadata-source-access-grants.md)
- [0089. Metadata source content browse](0089-metadata-source-content-browse.md)
- [0049. Item shops and shopping sessions](0049-item-shops-and-shopping-sessions.md) (if present) / Item Shops plugin
- [docs/plugins/metadata-source-access.md](../plugins/metadata-source-access.md)
- [docs/BRIDGE_LOCAL_TESTING.md](../BRIDGE_LOCAL_TESTING.md)
