# 0023. Publish playlists use room creator OAuth

**Date:** 2026-03-30  
**Status:** Accepted

## Context

The post-show publish flow can create Spotify and Tidal playlists from the room’s played history. Those APIs require an authenticated user. The scheduling app is used by platform admins who may not be the same person as the listening room host, and the scheduler does not yet implement its own OAuth flows for streaming services.

## Decision

When publishing a show, playlist creation uses the **listening room creator’s** linked Spotify/Tidal metadata sources—the same token path and `AdapterService` resolution as in-room “save playlist” (`roomId` + `room.creator`).

## Consequences

- **Positive:** No new OAuth or token storage in the scheduler; reuses existing server-side adapter binding.
- **Positive:** Behavior matches host expectations: playlists land in the host’s library when they have linked accounts.
- **Negative:** If the creator never linked a service, that service is skipped (no hard failure for the whole publish).
- **Negative:** The platform admin clicking Publish cannot target their own streaming account without additional product work.

## Future / more robust approach

A more robust approach is dedicated OAuth (or a shared service account) in the scheduling app or platform admin profile so the publisher explicitly authorizes playlist creation to a chosen account. That should be adopted when cross-account or org-owned playlist archives are required.
