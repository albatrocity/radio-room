# 0085. Multi-source DJ search relevance ranking

**Date:** 2026-07-29
**Status:** Accepted

## Context

DJ track search fans out across a room’s `metadataSourceIds` and concatenates per-source result blocks. Bridge rooms also dedupe overlapping Spotify/Tidal rows. The web **All** tab displays that list without reordering, so a strong local or YouTube match can sit under a full Spotify block.

`findBestMatch` already scores tracks for cross-source dedup / enrichment, but it is not used to order free-text search results. Fuse.js is already a dependency of guess-the-tune for fuzzy matching.

## Decision

1. After fan-out and optional `dedupeSearchResultsByPriority`, rank the combined list with **Fuse.js** in `@repo/utils` (`rankSearchResultsByRelevance`) against the user query (title weighted highest, then artists, then album).
2. Ranking runs on the **server** in `djHandlersAdapter.searchForTrack` for all multi-source rooms (same handler path). The client remains filter-only by `source` tab.
3. Do not attach a relevance score to the wire payload; only the ordered `items` array changes.

## Consequences

- **All** (and per-source tabs filtering that list) show better matches first without UI changes.
- Provider-native order within a source is no longer preserved after merge; relevance wins.
- Fuse.js is a dependency of `@repo/utils` (shared with the guess-the-tune usage pattern).

## See also

- [`packages/utils/rankSearchResultsByRelevance.ts`](../../packages/utils/rankSearchResultsByRelevance.ts)
- [`packages/utils/findBestMatch.ts`](../../packages/utils/findBestMatch.ts)
- [https://www.fusejs.io](https://www.fusejs.io)
