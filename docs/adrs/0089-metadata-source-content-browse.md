# 0089. Metadata source content browse

**Date:** 2026-08-02
**Status:** Partially superseded by [0090](0090-hybrid-metadata-catalog-browse.md)

## Context

Add to Queue today is free-text search across metadata sources ([ADR 0085](0085-multi-source-search-relevance-ranking.md)). Local libraries (Navidrome via Media Bridge) are large enough that DJs need hierarchical browsing—artists → albums → tracks—without typing a query. Browse is a catalog concern and belongs with search on **MetadataSource**, not MediaSource or PlaybackController ([ADR 0005](0005-adapter-pattern-for-media-services.md)).

## Decision

1. **Optional methods on `MetadataSourceApi`:** `listArtists`, `getArtist`, `getAlbum`. Adapters that omit them are non-browseable. A source is browseable iff all three are functions (`metadataSourceSupportsBrowse`).
2. **v1 hierarchy:** Artists → Albums → Tracks only. Queue individual tracks; no album/playlist bulk queue. Genres and **user-facing** browse-by-playlist are out of scope. (Invisible playlist membership for inventory-scoped Local filters is [ADR 0098](0098-inventory-scoped-local-library-catalog-filters.md).)
3. **Single-source requests:** Browse does not fan out or rank across sources (unlike search).
4. **Access:** Reuse the existing `search` action ([ADR 0088](0088-metadata-source-access-grants.md)). No separate `browse` grant.
5. **Capability advertisement:** `EFFECTIVE_METADATA_SOURCES` (and INIT) include additive `browseableSourceIds`: effective search sources whose room API supports browse. Clients show Browse UI when the list is non-empty; absence of the field means no browse.
6. **Local first:** v1 implements browse for the `local` metadata source via bridge RPC → Navidrome Subsonic (`getArtists` / `getArtist` / `getAlbum`).

## Consequences

- Add to Queue can offer Search | Browse when a browseable source is available.
- Spotify/Tidal/YouTube remain search-only until they implement the optionals.
- Browse payloads can be larger than search; v1 accepts full artist indexes for personal libraries with optional server-side name filter.
- Naming: content discovery stays on MetadataSource; MediaSource remains stream/now-playing identity.

## See also

- [0090. Hybrid metadata catalog browse](0090-hybrid-metadata-catalog-browse.md) (search-entry, listAlbums, Search entity rows)
- [0005. Adapter Pattern for Media Services](0005-adapter-pattern-for-media-services.md)
- [0013. Track Identity](0013-track-identity-media-and-metadata-sources.md)
- [0087. Room Bridge Media Source Policy](0087-room-bridge-media-source-policy.md)
- [0088. Metadata Source Access Grants](0088-metadata-source-access-grants.md)
