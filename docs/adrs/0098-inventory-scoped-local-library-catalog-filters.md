# 0098. Inventory-scoped Local library catalog filters

**Date:** 2026-08-17
**Status:** Partially superseded by [0099](0099-physical-media-personal-libraries.md)

## Context

Media Bridge rooms can mark the Local (`local`) metadata source **restricted** so only admins and plugin grants may search or queue ([ADR 0088](0088-metadata-source-access-grants.md)). Operators want **curated shelves** without editing ID3 tags or exposing Navidrome playlists as a user-facing browse/search mode.

[ADR 0089](0089-metadata-source-content-browse.md) kept genres/playlists out of **product** browse (artists → albums → tracks only). That constraint remains: listeners never search or browse “by playlist.” Playlists are operator tooling for **membership sets** that filter the same hierarchy.

Hard-coded grant SKUs forced code deploys for every shelf rename or new playlist. Admin-editable grant rows (with a bridge playlist picker) keep ops light while reusing the inventory/shop model. Playlist shelves are burned CDs; full library access is a Library Card.

## Decision

1. **Catalog grant on items:** `ItemCatalogEntry.localLibraryGrant` is either `{ scope: "library" }` (full Local catalog) or `{ scope: "playlist"; playlistKey: string }` (shelf key = item `shortId`).
2. **Config-driven SKUs:** Item Shops `localLibraryGrants` is an `object-array` of rows built from shared `itemDefinitionAuthoringSchema` **extended** with `scope` + `playlistId`. Rows are registered as inventory definitions and auto-stocked on Thrift Store at runtime (`onConfigChange` refreshes catalog + shop stock). Defaults seed `burned-cd-bargain-bin` (playlist shelf) and `library-card` (full library) with empty playlist ids.
3. **Access:** Holding any resolved grant (full library **or** at least one mapped playlist id) yields `grantMetadataSourceAccess` for `local`. Admins and `open` Local remain unfiltered and do not consume inventory. Unmapped playlist rows fail closed for that shelf.
4. **Invisible filter on RPC:** When Local is restricted and the user has only playlist-scoped grants, search/browse/getTrack carry `playlistIds`. The bridge daemon caches `getPlaylist` membership (TTL ~45s) and:
   - **Search:** `search3` ∩ track set
   - **Browse:** build artist/album indexes **from the playlist outward**
   - **Album detail:** omit tracks outside the set
5. **Full-library grants** (config `scope: "library"` or admin): omit `playlistIds`.
6. **Consume on queue:** Prefer a shelf grant whose playlist contains the track; otherwise redeem a full-library grant. Shelf-only users cannot queue tracks outside their union.
7. **No client playlist vector:** Do not add playlist tabs, playlist search, or playlist ids on `EFFECTIVE_METADATA_SOURCES` / browse capabilities.
8. **Admin playlist browser:** Bridge RPC `listPlaylists` (Subsonic `getPlaylists`) + admin socket `LIST_BRIDGE_LOCAL_PLAYLISTS` + config field type `remote-select` (`remoteSource: "bridgeLocalPlaylists"`). Falls back to a string id input when the bridge is offline.

## Consequences

- Operators curate shelves in Navidrome and bind them in Item Shops without code changes.
- Shelf browse cost scales with playlist size, not full library size.
- ADR 0089’s “playlists out of scope” means **user-facing browse-by-playlist**; inventory-scoped membership filtering is in scope here.
- Removing a config row stops shop stock; Redis definitions / held stacks are not auto-deleted (game-end strip still clears item-shops inventory).

## Ops runbook

1. In Navidrome, create selective playlists (hundreds–low thousands of tracks).
2. Room admin → Item Shops → enable → **Local library grants**:
   - Add/edit rows (name, price, rarity, scope).
   - For playlist shelves, pick a playlist from the dropdown (requires Media Bridge connected) or paste the id.
   - Keep or edit the seeded Burned CD: Bargain Bin and Library Card rows (add more burned CDs for additional shelves).
3. Set Content → Media sources → Library to **Admins + plugin grants only**.
4. Thrift Store (bridge-only) stocks grant rows + Scratched CD.

## See also

- [0088. Metadata source access grants](0088-metadata-source-access-grants.md)
- [0089. Metadata source content browse](0089-metadata-source-content-browse.md)
- [docs/plugins/metadata-source-access.md](../plugins/metadata-source-access.md)
- [docs/BRIDGE_LOCAL_TESTING.md](../BRIDGE_LOCAL_TESTING.md)
