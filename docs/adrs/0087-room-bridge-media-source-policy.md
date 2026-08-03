# 0087. Room-level Media Bridge source policy

**Date:** 2026-07-31
**Status:** Accepted

## Context

Bridge rooms search across Spotify, Tidal, YouTube, and local library. Daemon CAPABILITIES already gate which drivers are online ([filterMetadataSourcesByBridgeCapability](../../packages/utils/filterMetadataSourcesByBridgeCapability.ts)). Rooms still needed a **policy** layer so an admin can opt out of a source the daemon offers (e.g. bridge has YouTube enabled, but this room should not search YouTube).

`metadataSourceIds` already persisted that policy and drove search fan-out / TrackSearch tabs, but there was no admin UI for YouTube/Library/Tidal toggles while on the bridge controller—only auto-attach on bridge enter ([`seedBridgeMetadataSources`](../../packages/utils/bridgeMetadataSourcePolicy.ts) via AdminService).

## Decision

1. **Two layers for effective search sources** when `playbackControllerId === "bridge"`:
   - **Daemon CAPABILITIES** (session): which services the Mac bridge reports.
   - **Room `metadataSourceIds`** (policy): which sources the room opts into, edited by admins.
   - **Effective** = intersection of the two (existing filter in search + TrackSearch).
2. **Admin UI** (`BridgeMediaSourcesSettings`) in room Content settings, under Playback controller: toggles for YouTube, Tidal, and Library; Spotify always on for bridge rooms. Edits are Formik fields and persist only when the Content form is submitted.
3. **`SET_ROOM_SETTINGS { metadataSourceIds }`** (via Content form submit, or other callers) updates policy while on bridge. Server normalizes via `normalizeBridgeMetadataSourceIds` in [`@repo/utils/bridgeMetadataSourcePolicy`](../../packages/utils/bridgeMetadataSourcePolicy.ts) (require Spotify, drop unknown ids, drop YouTube when `youtubeAvailable` is false / no `YOUTUBE_API_KEY`). Switching to bridge accepts submitted `metadataSourceIds` when present; otherwise seeds defaults. Web admin form may show YouTube optimistically; save re-normalizes on the server.
4. **Switching to bridge** still seeds YouTube (if API key) + local defaults. **Leaving bridge** still strips those bridge-only sources. Opt-outs while on bridge are not remembered across leave/re-enter.

## Consequences

- Rooms can hide YouTube (or other bridge-tied sources) from Add to Queue without changing daemon config.
- Daemon-off sources stay in room policy when the admin leaves them opted in; search tabs hide them until CAPABILITIES restore the service.
- Re-selecting Media Bridge re-enables YouTube/Library defaults (no shadow preference field).

## See also

- [0077. Bridge composite playback controller](0077-bridge-composite-playback-controller.md)
- [0086. Metadata search result cache](0086-metadata-search-result-cache.md)
- [0088. Metadata source access grants](0088-metadata-source-access-grants.md)
- [`packages/utils/bridgeMetadataSourcePolicy.ts`](../../packages/utils/bridgeMetadataSourcePolicy.ts)
- [`apps/web/src/components/BridgeMediaSourcesSettings.tsx`](../../apps/web/src/components/BridgeMediaSourcesSettings.tsx)
