# 0204. Device trust boundary

**Date:** 2026-10-14
**Status:** Accepted

## Context

The API is the only writer of room state, and the only process that should hold the platform Redis URL. The DJ Mac was publishing `SYSTEM:NOW_PLAYING_CHANGED`, pattern-subscribing to `SYSTEM:*` for segment cues, and speaking bridge playback over Redis Pub/Sub. Anyone with that URL could publish unsigned control, including reading `bridge:{room}:spotify_token`. [ADR 0082](0082-media-bridge-link-via-redis-pubsub.md) named Redis as the trust boundary for that control path. [ADR 0036](0036-stream-health-webhook-for-live-rooms.md) already had the pattern to copy: MediaMTX posts to the API with a shared bearer and never opens Redis.

Two processes stay on the Mac ([ADR 0084](0084-dj-mac-single-zip-supervised-bridge.md)). local-remote keeps CoreAudio, ducking, Farrago OSC, and `Now Playing.txt`. bridge-daemon keeps mpv, Chrome, the Spotify Web Playback SDK, the local library, and `say`.

## Decision

1. **Now playing** enters through `POST /api/device/now-playing`. The body is `{ roomId, title, artist?, album? }`. The handler calls `submitMediaData` with `sourceType: "rtmp"` and the same track id join the RTMP subscriber uses. An empty title submits no track, which clears now playing. The Mac still writes `Now Playing.txt` locally.
2. **Segment cues** are pushed on `/device` as a `segment` event in the same turn `SEGMENT_ACTIVATED` is emitted. The payload matches that event (`roomId`, `showId`, `segmentId`, `segmentTitle`) plus `at`. local-remote joins the namespace with `watch` and its room id, and fires OSC when the segment id changes. A join sends the current segment once, including an empty `segmentId` when none is active, so a reconnect can catch up. `GET /api/device/active-segment` remains that snapshot. It is not polled. local-remote does not subscribe to Redis. A segment watcher is not a bridge: it does not write presence and playback RPC does not target it.
3. **Auth for those HTTP routes** is `DEVICE_INGRESS_SECRET`, compared the same way as `STREAM_HEALTH_SECRET` (Bearer equality). The pack stores it on local-remote config and the supervisor passes it to the bridge child with `BRIDGE_API_BASE_URL` (the existing `platformApiBaseUrl`). It does not pass `BRIDGE_REDIS_URL`.
4. **Bridge playback** uses a Socket.IO namespace `/device` owned by bridge-daemon. Method names stay the `BridgeRequest` set (`play`, `pause`, `playTrack`, `seekTo`, and the rest). `STATE`, `ENDED`, and `CAPABILITIES` travel socket-to-server. The API writes `bridge:{room}:presence`, `:capabilities`, and `:last_ended` itself when jobs still read them. The daemon does not.
5. **Link.** A standby socket authenticates with the pack secret so the API can deliver a one-time link code created in memory for `LINK_MEDIA_BRIDGE`. The code is not written to Redis. A matching ACK binds the socket to the room and the API returns a device token over the socket. Later connections may present that token. The API stores the token in its own Redis (`device:session:{token}`) so a restart still recognizes the daemon. The Spotify access token is pushed on the socket on `TOKEN_REQUEST` and is not written to `bridge:{room}:spotify_token` while that socket is connected. The Connect device id is still stored by the API at `bridge:{room}:spotify_device`, because playback targeting reads it there.
6. **Room list** for the local UI is `GET /api/device/rooms` with the same bearer.
7. **Old packs.** The API still accepts Redis `SYSTEM:NOW_PLAYING_CHANGED` and still falls back to Redis bridge RPC and `BRIDGE:CONTROL` when no device socket is connected for the room. That fallback is removed only after field packs have moved ([phase 4 of the plan](../../plans/device-trust-boundary.md)). Do not treat the shared bearer as the finished boundary: until the fallback is gone, a daemon that still has the Redis URL can read the Spotify token key.

## Consequences

- **Positive:** A current DJ Mac pack does not need the platform Redis URL. Room policy (queue, chat, admin, plugins) is not on the device channel.
- **Positive:** MediaMTX is unchanged. It already webhooks the API.
- **Negative:** `DEVICE_INGRESS_SECRET` is a shared bearer, the same class of secret as stream health. It is acceptable only while per-daemon tokens are the path for bridge-daemon and the Redis fallback is temporary.
- **Negative:** A socket that is down during the activation misses that cue. The join snapshot reports the segment that is still active, and OSC fires only when the segment id changed, so a reconnect does not restart the theme song.
- **Negative:** The device socket registry is in-memory on the API process. Presence keys are what other jobs read after a lookup that is not on that socket. `ENDED` is applied in-process and also written to the durable key the advance job already consumes.
- **Supersedes:** The sentence in [ADR 0082](0082-media-bridge-link-via-redis-pubsub.md) that Redis is the trust boundary for unsigned bridge control. Redis link and RPC remain only as the fallback for a daemon that has not connected on `/device`. The `PSUBSCRIBE SYSTEM:*` rule in [ADR 0025](0025-local-remote-rust-daemon.md) is replaced by the `/device` segment event; the Rust binary, localhost UI, and OSC map stay. The `BRIDGE_REDIS_URL` injection named in [ADR 0084](0084-dj-mac-single-zip-supervised-bridge.md) is replaced by `BRIDGE_API_BASE_URL` and `DEVICE_INGRESS_SECRET`. The single zip and two-process supervision stay. The Redis room-discovery rule in [ADR 0079](0079-bridge-daemon-local-control-ui.md) is replaced by `GET /api/device/rooms`; the localhost UI stays.

## See also

- [0036](0036-stream-health-webhook-for-live-rooms.md)
- [0082](0082-media-bridge-link-via-redis-pubsub.md)
- [0084](0084-dj-mac-single-zip-supervised-bridge.md)
- `packages/server/controllers/deviceIngressController.ts`
- `packages/server/lib/deviceNamespace.ts`
