# 0090. Hybrid metadata catalog browse

**Date:** 2026-08-03
**Status:** Accepted

## Context

ADR 0089 introduced optional browse methods (`listArtists`, `getArtist`, `getAlbum`) with a local/Navidrome index as the first implementation. Spotify’s catalog is too large for an artist index, so browse must support **search-then-drill-down** (find artist → albums → tracks, or find album → tracks). The Add to Queue UX should also surface artist/album hits in text Search that deep-link into the same drill-down, for every browseable source (Spotify and local).

## Decision

1. **Entry modes** via optional `getBrowseCapabilities()`:
   - `entryMode: "index"` — Browse may load artists (and albums) without a query (local).
   - `entryMode: "search"` — Browse requires a query before listing (Spotify); empty `listArtists`/`listAlbums` query returns `{ items: [] }`.
   - `albumSearch: boolean` — when true, Browse shows Artists | Albums roots (`listAlbums` implemented).
2. **Optional `listAlbums({ query?, offset?, limit? })`** — album-as-entry listing; not required for `metadataSourceSupportsBrowse`.
3. **Capability advertisement:** `EFFECTIVE_METADATA_SOURCES` / INIT keep `browseableSourceIds` and add `browseSourceCapabilities: Record<sourceId, { entryMode, albumSearch }>`.
4. **Search entity enrichment:** `searchForTrack` emits one `TRACK_SEARCH_RESULTS` that includes additive `artists` / `albums` (up to 5 each per browseable source) after track fan-out + entity fetches. Client “All” tab caps to 5+5 total.
5. **Access:** still the `search` action ([ADR 0088](0088-metadata-source-access-grants.md)).
6. **Spotify:** search-entry browse; artist albums use `include_groups=album,single`. **Local:** index-entry; `listAlbums` via Subsonic `search3` / first page of `getAlbumList2` (50).

## Consequences

- Browse UI is capability-driven, not hard-coded to `local`.
- Search and Browse share drill-down; FormAddToQueue keeps both mounted so deep-links do not wipe Search state.
- 0089’s “local-only / index-shaped listArtists” assumption is partially superseded; core browseability rule (three methods) remains.

## See also

- [0089. Metadata source content browse](0089-metadata-source-content-browse.md)
- [0085. Multi-source DJ search relevance ranking](0085-multi-source-search-relevance-ranking.md)
- [0088. Metadata source access grants](0088-metadata-source-access-grants.md)
