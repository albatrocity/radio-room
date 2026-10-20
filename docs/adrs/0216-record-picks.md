# 0216. Record picks: designer-chosen albums from any source as Physical Media

**Date:** 2026-10-19
**Status:** Accepted

## Context

Trip sites and shops sell records from a bin filtered by format and genre over albums derived from Navidrome ([0214](0214-physical-media-carry.md)). Designers also want to choose specific albums. For example, "Dusty Boots Records" sells country and folk from the library, plus three Neil Young LPs from Spotify and a Gene Clark album from the library, all mixed together. Travelers shouldn't be able to tell where a record came from. The authoring shape shouldn't expose Spotify or Navidrome details.

This matters most in bridge rooms where Spotify is `restricted` ([0088](0088-metadata-source-access-grants.md)). Owning a picked Spotify record has to unlock that album, just as a library record unlocks its tracks.

## Decision

1. **One pick shape for every source.** `PhysicalMediaPick` is `{ source, id, title, artist, year?, trackCount, imageUrl?, format?, lore? }`, defined in `@repo/types` along with `physicalMediaPickSchema`.
   - `source` is a metadata source id (`PICKABLE_RECORD_SOURCES`: `spotify`, `local`).
   - Game Studio snapshots the pick's fields when the designer picks it, so maps stay portable.
2. **A bin has two optional halves.** `PhysicalMediaStock = { library?: PhysicalMediaCarry; picks?: PhysicalMediaPick[] }`, capped at `MAX_RECORD_PICKS` (24).
   - `library` is the unchanged 0214 filter; `library: {}` sells every derived record.
   - The stock replaces the bare carry everywhere: `ShopCatalogEntry.physicalMedia`, site `services.physicalMedia`, `OpenRoomShopRequest`, `ValidateShopRequest` and `RoomShopScope`.
   - The trip map parser lifts a legacy top-level `{ formats, genres }` into `library`. Trips haven't shipped, so there's no `schemaVersion` bump.
3. **Picks pool with library records.** `withPhysicalMediaStock` appends the matched library records and the stockable picks into one pool with `distinctOffers`, so each traveler sees 3 distinct records from both halves.
   - A pick stocks only when its source is in the room's `listMetadataSources` and it resolved.
   - Code-defined shops in `packages/plugin-item-shops/shops` can declare `physicalMedia` with picks the same way. Their picks register at `register` and after each library refresh.
4. **Resolution.** `resolvePick` handles each source differently:
   - A Spotify pick uses its id as is.
   - A local pick tries its authoring id against the room's library albums, then a normalized artist + title match (case, accents, a leading "The", edition suffixes like "(2009 Remaster)"), preferring a matching year. Navidrome ids belong to one server.
   - An unresolved local pick is skipped, with a `validateShop` warning.
5. **Records.** A resolved pick becomes the record `pm-{source}-{format}-{albumId}`.
   - The format is the pick's override, or else the usual `inferPhysicalMediaFormat`. Game Studio always writes the format and defaults Spotify singles to 45s.
   - `ItemDefinition.mediaAlbum` names the source and album; derived Navidrome album records carry it too.
   - **Local picks** carry the album-scope `localLibraryGrant`, so the restricted-Local catalog filter, membership checks, wear, sleeves and lore work unchanged.
   - **Other sources** carry `ItemCatalogEntry.recordAlbum`.
   - A designer's `lore` wins over the library's album comment.
6. **Persistence.** Resolved picks live in Item Shops plugin storage (`record-picks:v1`) and load at `register`. A sold record keeps resolving after the stop closes, the map unloads or the server restarts.
7. **Track-scoped grants.** `grantMetadataSourceAccess` params gain an optional `trackId`. `DJService` passes it on queue checks.
   - Item Shops grants a non-local `queue` only when a held picked record's album lists that track.
   - It checks this with the new `CatalogPluginAPI.getAlbumTrackIds({ roomId, sourceId, albumId })`, which uses the room's credentials and is cached for an hour.
   - Search, and checks without a track, abstain. A record never opens the whole catalog.
8. **Same device and wear rules.** On a restricted non-local source, a held pick that covers the track needs a matching player (or the van) and wears like a library record.
   - A track no pick covers passes untouched, so other plugins' grants (round robin) still work.
9. **Browse.** `browseMediaItem` resolves the held record first.
   - Local records still need Local `search` access. A held non-local record is its own authorization.
   - `fetchResolvedMediaItemTracks` lists non-local albums through the room's metadata source.
   - My Media lists held records even without Local. The web client shows them under a browse-only **My Records** entry when Local isn't browseable.
10. **Authoring.** Game Studio's **Sells physical media** service has two sections:
    - **From the room's library**: formats and genres.
    - **Picked albums**: one search box over Spotify and the designer's Navidrome, a format select, and editable lore.
    - Lookups go through studio-bridge (`/records/*`), using Spotify client credentials and Subsonic. Each source is on only when its env is set.

## Consequences

- Designers mix bespoke albums with genre bins, and travelers never see the source.
- Bridge rooms can keep Spotify restricted and still sell Spotify albums. Each record unlocks only its own album.
- Spotify picks have no track previews; previews stay a Local stream feature.
- Now Playing matches a non-local track to a picked record by the queued track's source and album id (`sourceAlbumOf`), with no RPC, and shows that record's sleeve and cover. When an LP and a CD pick share an album, the sleeve is the first by shortId, not necessarily the copy that wore.
- A Spotify album's tracks are fetched with the room creator's token at queue time (cached). If that token fails, the grant abstains and the queue is refused.
- Local picks depend on the room's library having the album. Different editions may resolve to the wrong pressing; the id match wins when the designer's Navidrome is the room's.
- The format is part of the record id. Changing a pick's format later sells a new SKU; copies already sold keep the old one.

## See also

- [0088. Metadata source access grants](0088-metadata-source-access-grants.md)
- [0155. Physical Media condition, wear, and conversion](0155-physical-media-condition-wear-and-conversion.md)
- [0214. Physical media carry](0214-physical-media-carry.md)
- [0215. The van shares playback formats](0215-van-shared-playback-formats.md)
