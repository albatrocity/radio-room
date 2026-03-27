# 0013. Track Identity via Explicit Media and Metadata Sources

**Date:** 2025-01-01
**Status:** Accepted

## Context

Tracks in the Listening Room can originate from different media sources (Spotify, Shoutcast) and be enriched by different metadata sources (Spotify, Tidal). The original design used a single `track.id` field that was overloaded for storage keys, API lookups, and cross-service identity. This led to:

- **Synthetic IDs**: Parsing and constructing composite IDs like `spotify:trackId` with string manipulation utilities.
- **Adapter coupling**: Code assumed specific ID formats, making it impossible to support services with different ID schemes.
- **Ambiguity**: A track's `id` didn't distinguish between "where to play it" and "where to look up its metadata."

## Decision

Replace the single `track.id` with **explicit source fields** on `QueueItem`:

- **`mediaSource`** (required): `{ type: string, trackId: string }` — identifies where the audio comes from. Used for playback, queue deduplication, and Redis keys.
- **`metadataSource`** (optional): `{ type: string, trackId: string }` — identifies where enriched metadata (artwork, album, duration) came from.

Key rules:

- **Comparison and Redis keys** use `mediaSource.type:trackId` as the canonical identity.
- **API calls** use `metadataSource` when the source type matches the target service.
- The old `trackId` parsing utilities were deleted.
- **No backward compatibility** was maintained, by explicit choice, to avoid perpetuating the old patterns.

## Consequences

- **Clear identity model**: "Where to play it" and "where to look it up" are separate, explicit concerns.
- **Multi-service support**: A Shoutcast stream can have Spotify metadata without synthetic ID hacks.
- **Simpler code**: No string parsing, no format assumptions, no adapter-specific ID construction.
- **Trade-off**: Breaking change required migrating all existing queue items and Redis keys in one pass.
- **Trade-off**: Code that only needs "the track ID" must now decide which source to use, adding a small decision point.

See also: [work-history/TRACK_ID_SEPARATION_PROPOSAL.md](../../work-history/TRACK_ID_SEPARATION_PROPOSAL.md)
