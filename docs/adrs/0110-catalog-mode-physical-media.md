# 0110. Catalog-mode Physical Media (albums + prefixed playlists)

**Date:** 2026-08-21
**Status:** Accepted

## Context

[ADR 0099](0099-physical-media-personal-libraries.md) derives Record Store Physical Media only from Navidrome playlists prefixed `[CD]`, `[LP]`, `[TAPE]`, or `[45]`. That remains the best path when operators want curated comments, covers, and format labels. For large libraries it is sometimes simpler to stock **every album** automatically, with format inferred from release year and track count, while still keeping prefixed playlists as the operator-authored override.

Constraints from 0099 still apply: clients never see Navidrome playlist or album ids (`mediaKey` only); Local restricted shelves must fail closed; old DJ Mac packs must not half-apply new grants.

## Decision

1. **Two Item Shops toggles** (room/segment plugin config, not `GameSessionConfig`):
   - `derivePrefixedPlaylistsAsPhysicalMedia` (default `true`) — today’s prefix-named playlist derivation.
   - `deriveAlbumsAsPhysicalMedia` (default `false`) — one durable collection SKU per Navidrome album.
2. **Album format heuristic** (`inferPhysicalMediaFormat`): `songCount` in 1–3 → 45; else `year < 1983` → LP; else `year < 1991` → Cassette; else (including missing year on longer albums) → CD. Price/rarity stay song-count based. Album `shortId` is `pm-al-{albumId}`.
3. **Playlist-over-album de-dup:** When both toggles are on, if a *derived* prefixed playlist’s ordered track ids exactly equal an album’s canonical track ids, **omit the album SKU**. Playlists win for description, prefix format, cover, and `physicalMediaOverrides`. Subsets, shuffles, extras, and mixed-album playlists do not shadow.
4. **Album grants:** `LocalLibraryGrant` gains `{ scope: "album"; albumKey; redemption: "durable" }`. Restricted Local catalog filters are `{ playlistIds, albumIds }` (union). Album-only holders must not fall through to an unfiltered library (`getLocalCatalogShelves`).
5. **Browse / preview:** `resolvePhysicalMediaItem` / preview resolve to `ResolvedPhysicalMediaItem` (`kind: "playlist" | "album"`). Track listing uses playlist tracks or `getAlbum` accordingly; clients still send only `mediaKey`.
6. **Bridge RPCs:** New methods `listLibraryAlbums` and `getAlbumCoverArt` (stubs/keys only on list — no browse data URIs). Existing catalog RPCs accept optional `albumIds` for membership union. Unknown methods fail closed (no album SKUs registered).
7. **ADR 0099** remains Accepted; prefix derivation is now **gated by config** rather than always on. This ADR extends it; it does not supersede it.

## Consequences

- Operators can stock a whole library without authoring one playlist per album, and still override specific titles with prefixed playlists.
- Large libraries make refresh costlier for listing + optional de-dup. De-dup uses lean `listPlaylistTrackIds` / `listAlbumTrackIds` (membership ids only — no per-track cover mapping). **Album cover art is not fetched during refresh** — sleeves hydrate in background batches and on demand for open shop offers / held items (see performance review F3/F4). Acceptable for admin/config/bridge-status rebuilds.
- Give-item selects and Record Store catalogs grow with album count; `distinctOffers` still samples a small offer set.
- Requires a current DJ Mac pack for album catalog mode; older packs leave album derivation empty.
- Album membership LRU is sized independently of playlists (larger default) and unions fetch with bounded concurrency; album-only shelves filter search/`findById` by `song.albumId` without unioning every held album's track list.

## See also

- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [0098. Inventory-scoped Local library catalog filters](0098-inventory-scoped-local-library-catalog-filters.md)
- [`packages/plugin-item-shops/localLibrary/`](../../packages/plugin-item-shops/localLibrary/)
