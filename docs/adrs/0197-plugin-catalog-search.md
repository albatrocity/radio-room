# 0197. Plugin catalog search

**Date:** 2026-10-01
**Status:** Accepted

## Context

Plugins can queue tracks with `addToTrackQueue(roomId, metadataTrackId)`, but nothing gives them a `metadataTrackId` unless an admin pasted one into config. Request bots, "more like this" fillers, and theme rounds that search by mood need the same search users get.

User search already lives in `searchTracksAcrossSources` ([ADR 0085](0085-multi-source-search-relevance-ranking.md)–[0090](0090-hybrid-metadata-catalog-browse.md)): fan-out across room sources, bridge capability filtering, per-user access ([ADR 0088](0088-metadata-source-access-grants.md)), Local catalog shelves, cross-source dedupe, and relevance ranking.

## Decision

1. **`PluginAPI.searchTracks({ query, sourceId?, userId?, limit? })`** returns `{ success: true, tracks: { id, title, artists, durationMs, source }[] } | { success: false, message }`. `id` is the value `addToTrackQueue` accepts and `source` is its `mediaSourceType`. Default limit 10, max 25.
2. **Same pipeline as users.** It calls `searchTracksAcrossSources` with `DJService.searchForTrack`. No second copy of dedupe, ranking, or capability filtering.
3. **Room scope by default.** Without `userId`, sources are the room catalog (`metadataSourceIds` ∩ bridge capabilities, as `listMetadataSources`) with no per-user restriction and no Local shelf filter. With `userId`, the existing per-user access and shelf rules apply, so a plugin searching on behalf of a listener sees what that listener could see.
4. **`sourceId`** narrows the fan-out to one source; a source not in the effective set is a failure, not an empty list.
5. **Tracks only.** The artist/album entity enrichment is skipped (`includeEntities: false`) to avoid two extra browse calls per source.

## Consequences

- Plugins can turn free text into queueable ids without bespoke adapter calls.
- A plugin that searches without `userId` can see restricted bridge sources. That matches the plugin trust model (plugins can already queue with plugin attribution); plugins acting for a listener should pass `userId`.
- Search cost per call is the same as one user search; plugins that search on every chat message must debounce themselves.

## See also

- [0088](0088-metadata-source-access-grants.md) — metadata source access grants
- [0087](0087-room-bridge-media-source-policy.md) — room bridge media source policy
