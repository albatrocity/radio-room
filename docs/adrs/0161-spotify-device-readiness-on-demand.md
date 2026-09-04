# 0161. Spotify SDK device readiness is prepared on demand, not by reload-looping

**Date:** 2026-09-04
**Status:** Accepted

## Context

A Spotify track queued after a long stretch of local/YouTube playback frequently failed to start. The DJ's workaround was to open Spotify.app and manually select the "Listening Room Bridge" device.

Three defects compounded:

1. **The blind-device watchdog reload-looped.** [0112](0112-observed-transport-state.md) reloads `spotify.html` when `getCurrentState()` stays null for 15s, on the theory that a blind SDK is a detached one. But `getCurrentState()` returns null whenever this player is *not Spotify's active device* — which is the entire duration of any non-Spotify stretch. So every ~15s the daemon deleted `bridge:{roomId}:spotify_device` and recreated the Player. A play command landing in that window found no advertised device and fell through to `getNowPlayingDevice()` → "No active device found", or targeted a player that a reload had just disconnected.

2. **Stale same-named devices could win.** Both the daemon's `resolveListedDeviceId` and the API's `resolveTargetDevice` took the *first* device named "Listening Room Bridge". Recreating a Player leaves the previous one listed until Spotify reaps it, so the churn above made a dead device a plausible first match.

3. **Recovery gave up permanently.** [0132](0132-spotify-sdk-playback-error-lease-renewal.md)'s attempt counter only reset on an observed *playing* snapshot, so two failed reconnects disabled lease renewal for the rest of the session.

Underneath all three: the lease is only ever renewed *reactively*, after a play has already failed. Nothing makes the device ready **before** the command that needs it.

## Decision

1. **Blind is only a fault when Spotify should be audible.** `SpotifyDeviceHost` tracks `spotifyExpectedActive` — set by `prepare()` and by any observed playing snapshot, cleared when `Router.playTrack` hands playback to a driver. `shouldReloadForBlindSdk()` gates the 15s reload on it. While another source owns playback the device id stays advertised and the Player is left alone.

2. **Prepare the lease on demand.** New `prepareSpotify` RPC. `adapter-bridge` calls it immediately before `playTrack` / `play` on the Spotify delegate. The daemon renews only a lease older than 5 minutes (`isLeaseStale`), waits for `ready` and the Connect-list reconciliation, and writes Redis before resolving — so the API's `getPreferredDeviceId` reads the new id. Back-to-back Spotify tracks pay nothing; a stale one pays ~1-3s exactly when it would otherwise have failed. Best effort: a prepare that fails or times out must not block the play.

3. **Pick the live device among duplicates.** `pickBridgeDevice()` (both sides) prefers the id just reported ready / the advertised id, then whichever is `is_active`, then the sole match — and warns when several are listed.

4. **Confirm playback out of band, retry once.** A stale lease accepts `startResumePlayback` (204) and plays nothing, so the HTTP result cannot confirm a start. `playTrack` fires an un-awaited confirm — the healthy path must not delay the now-playing broadcast — that re-resolves the device and replays once if the track never appeared, abandoning the retry if a newer track has since been commanded. Bridge rooms only (gated on `getPreferredDeviceId`), so non-bridge rooms are unchanged.

5. **Decay the `playback_error` attempt counter.** Attempts reset after 2 minutes without an error: a later failure is a new episode, not a continuing loop.

Also: settle 400ms after an explicit `transferPlayback` before commanding play, since Spotify applies transfers asynchronously.

## Consequences

- A Spotify track reaching the top of the queue after a long local/YouTube stretch starts on the first click, without a human touching Spotify.app.
- The Connect device id is stable across non-Spotify stretches instead of churning every 15s.
- A genuinely detached player is still caught — but only once Spotify is the expected source, which is when it matters.
- `prepare()` adds latency to the first Spotify track after an idle stretch. That is the case that used to fail outright.
- The confirm pass costs two extra `getPlaybackState` calls per bridge Spotify track.
- An unplayable URI still ends after its retries and waits for the advance job / a skip.

## See also

- [0078](0078-spotify-web-playback-sdk-device.md)
- [0112](0112-observed-transport-state.md)
- [0132](0132-spotify-sdk-playback-error-lease-renewal.md)
- `apps/bridge-daemon/src/spotifyDevice.ts`
- `packages/adapter-bridge/lib/playbackControllerApi.ts`
- `packages/adapter-spotify/lib/playbackControllerApi.ts`
