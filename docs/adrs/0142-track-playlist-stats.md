# 0142. Track playlist stats (published-show history)

**Date:** 2026-09-01
**Status:** Accepted

## Context

After publish, curated playlist rows live in Postgres [`room_playlist_track`](../../packages/db/src/schema/scheduling.ts) ([ADR 0024](0024-post-show-publish-and-archive-flow.md)). Room members want on-demand history for a track: debut vs returning, recent show appearances, and light aggregates — without reading the live Redis playlist or draft continue rows.

Track identity follows [ADR 0013](0013-track-identity-media-and-metadata-sources.md): canonical `(mediaSourceType, mediaSourceTrackId)` with optional Spotify/Tidal catalog ids from play-time enrichment stored at publish ([`mapMediaIds`](../../packages/server/operations/showPublish.ts)).

## Decision

1. **Endpoint:** `GET /api/rooms/:roomId/track-stats` with query params `mediaSourceType`, `mediaSourceTrackId`, optional `spotifyTrackId`, `tidalTrackId`. Response shape: [`TrackStatsDTO`](../../packages/types/TrackStats.ts).

2. **Auth:** [`resolveRoomMemberUserId`](../../packages/server/lib/resolveRoomMemberUserId.ts) — valid room member via Express session or `X-Radio-Session-Id` + online in room. Any identity params allowed once authenticated (UI sends ids from visible rows).

3. **Dataset:** Only rows whose joined `show.status = 'published'`. Live show and continue-draft playlists are excluded until finalize.

4. **Match rule:** A row matches if `(media_source_type, media_source_track_id)` equals the required pair, **or** `spotify_track_id` equals a provided Spotify id, **or** `tidal_track_id` equals a provided Tidal id. No `youtube_track_id` column; local tracks use Navidrome song ids on the media-source pair plus optional catalog ids when enriched.

5. **Aggregation:** `appearanceCount` = matching playlist rows; `showCount` = distinct shows; `recentAppearances` = last **5 distinct shows** (newest first); `topDjs` = up to 3 by appearance count; DJ names from `track_payload.addedBy.username` snapshot. Do not return `showId`.

6. **Cache:** Redis via [`withCachedJson`](../../packages/utils/cachedJson.ts) on `AppContext.cache`, key `track-stats:v1:{type}:{trackId}:{spotify|-}:{tidal|-}`, TTL **86400** seconds. Global per identity (room id is auth-only). No invalidate on finalize in v1.

7. **Client:** Stats button on playlist queue + history rows ([`PlaylistItem`](../../apps/web/src/components/PlaylistItem.tsx)); popover anchored to the button (`popoverInScrollContainer`), fetch on open; hidden when plugin title-obscure is active. No new XState actor.

8. **Indexes:** btree on `(media_source_type, media_source_track_id)`, `spotify_track_id`, `tidal_track_id` on `room_playlist_track`.

## Consequences

- **Positive:** Reuses durable publish snapshot; 24h cache keeps Postgres off the hot path for repeat clicks.
- **Positive:** Hybrid OR lets enriched local/YouTube rows join Spotify/Tidal history without new columns.
- **Trade-off:** Up to 24h staleness after a show publishes (false debut until TTL).
- **Trade-off:** Unenriched local tracks and Navidrome id churn do not collapse with catalog plays; accepted for v1.
- **Trade-off:** Any room member can query arbitrary catalog ids (titles + snapshot DJ names only).

See also: [0024](0024-post-show-publish-and-archive-flow.md), [0013](0013-track-identity-media-and-metadata-sources.md), [0086](0086-metadata-search-result-cache.md)
