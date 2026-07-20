---
name: macOS Media Bridge Design
overview: Detailed design for consolidated multi-service playback (Spotify, Tidal, YouTube, local library) in stream-backed rooms (radio/Shoutcast and live/RTMP), built as a server-side composite bridge adapter plus a headless Mac daemon that drives a real browser via CDP, eventually packaged in an Electron menu-bar supervisor shell (never a playback runtime).
todos:
  - id: adr
    content: Write ADR for composite bridge playback controller, Redis RPC protocol, and per-service driver pattern
    status: pending
  - id: spike-tidal
    content: "Spike: drive Tidal playback via CDP - real Chrome tab vs Tidal desktop app with --remote-debugging-port"
    status: pending
  - id: spike-navidrome
    content: "Spike: Navidrome library + mpv JSON IPC playback controlled by the daemon"
    status: pending
  - id: spike-rpc
    content: "Spike: Redis request/reply RPC between adapter and daemon with correlation IDs and timeouts"
    status: pending
  - id: phase1
    content: "Phase 1: adapter-bridge composite + bridge daemon with YouTube and local drivers, enum widening, advance loop, now-playing publishing"
    status: pending
  - id: phase2
    content: "Phase 2: Tidal CDP driver and Spotify Connect composition through the router"
    status: completed
  - id: phase3
    content: "Phase 3: fan-out search with source tags, web UI badges, cross-source dedup with configurable mediaSourcePriority; export skip counts + optional export-time enrichment for Spotify/Tidal playlists"
    status: completed
  - id: phase4
    content: "Phase 4: Electron menu-bar supervisor shell (attach-or-launch, health, session toggles) + absorb local-remote duties"
    status: cancelled
  - id: phase4-local-ui
    content: "Phase 4 interim: local HTTP control UI + Redis room discovery + full config editing (ADR 0073); Electron packaging still deferred"
    status: completed
isProject: false
---

# Media Bridge: Consolidated Multi-Service Playback

## 1. Concept

Two new pieces, no Electron playback runtime:

1. **`packages/adapter-bridge`** - a **composite `PlaybackController`** implementing the existing [PlaybackControllerApi](packages/types/PlaybackController.ts). Routes each track by `QueueItem.mediaSource.type`: `spotify` delegates to the existing `adapter-spotify` controller (native Spotify.app via Spotify Connect); `tidal` / `youtube` / `local` go over Redis RPC to the bridge daemon.
2. **`apps/bridge-daemon`** - a headless Node/TypeScript daemon on the DJ Mac (reuses `@repo/types`, puppeteer-core). Drives a dedicated real Chrome via CDP (Tidal + YouTube), mpv via JSON IPC (local files, indexed by a local Navidrome), publishes now-playing, and writes AudioHijack metadata text. Later wrapped by an Electron menu-bar supervisor shell (Phase 4).

Targets **stream-backed rooms**: **radio (Shoutcast)** - the primary broadcast method today - and **live (RTMP)**. All DJ-Mac audio (Spotify.app, dedicated Chrome, mpv) is captured by AudioHijack and broadcast per room type. Opt-in per room via `playbackControllerId: "bridge"`. Bridge rooms must be `playbackMode: "app-controlled"` (radio rooms already default to this, ADR 0064); `queueSongAs`'s spotify-controlled branch (`playbackController.api.addToQueue`) is never taken for bridge rooms.

### Confirmed decisions

- **One room at a time, switchable at runtime**: the daemon serves a single room per session, but the active room is selected from the CLI/menu-bar (`bridge-daemon connect --room {id}` / a room picker in the shell) rather than requiring a config edit. Switching rooms = graceful disconnect from the old room's channels, reconnect + handshake on the new room's. `config.json` stores a `defaultRoomId` convenience, not a binding. (The local-remote scheduling picker precedent - public read-only API listing rooms/shows, ADR 0029 - can back the picker UI.)
- **Spotify now-playing via adapter push**: when the composite routes a track to the Spotify delegate, the adapter pushes the track's title/artist/album to the daemon over the event channel so Now Playing.txt stays correct with one code path - no AppleScript watcher (see 6.8).
- **YouTube requires a Google Cloud API key** (`YOUTUBE_API_KEY` env var, Data API v3 enabled) and the dedicated Chrome profile is **signed into YouTube Premium** (otherwise ads broadcast).
- **Local playback via mpv directly** (not Navidrome's jukebox mode - see 6.7).

## 2. Repository layout

```
packages/adapter-bridge/
├── index.ts                  # PlaybackControllerAdapter + MetadataSourceAdapter ("local") exports
├── lib/
│   ├── rpcClient.ts          # Redis request/reply with correlation IDs, presence short-circuit
│   ├── playbackControllerApi.ts  # Composite API: route by mediaSource.type
│   ├── activeSource.ts       # Redis-backed active-source tracking per room
│   ├── bridgeAdvance.ts      # Advance loop: ENDED-event driven + 1s fallback probe
│   ├── capability.ts         # Capability cache from daemon handshakes/heartbeat
│   └── protocol.ts           # Zod schemas for all BRIDGE:* messages (shared via package export)
└── package.json

apps/bridge-daemon/
├── src/
│   ├── index.ts              # CLI entry: load config, connect/disconnect commands
│   ├── config.ts             # config.json load/validate (zod)
│   ├── rpcServer.ts          # Redis subscriber: dispatch BRIDGE requests to router
│   ├── presence.ts           # Heartbeat key refresh, graceful disconnect message
│   ├── router.ts             # Active-driver state machine (pause old, load new)
│   ├── nowPlaying.ts         # SYSTEM:NOW_PLAYING_CHANGED publish + AudioHijack text file
│   ├── chrome.ts             # Attach-or-launch dedicated Chrome, tab management
│   └── drivers/
│       ├── Driver.ts         # Common driver interface
│       ├── youtube.ts        # Daemon-hosted IFrame API page
│       ├── tidal.ts          # CDP DOM automation (host chosen by spike)
│       └── local.ts          # Navidrome search3 + mpv JSON IPC playback
├── static/youtube.html       # IFrame Player API host page
└── package.json
```

## 3. Transport: Redis RPC protocol

The daemon reuses the `local-remote` connection pattern (`redisUrl` in local config, `rediss://` TLS supported). All message bodies are JSON validated with zod schemas in `adapter-bridge/lib/protocol.ts`.

### Channels and keys (room-scoped)

| Name                                   | Kind           | Direction                  | Purpose                                    |
| -------------------------------------- | -------------- | -------------------------- | ------------------------------------------ |
| `BRIDGE:{roomId}:REQUEST`              | pub/sub        | adapter -> daemon          | RPC requests                               |
| `BRIDGE:{roomId}:RESPONSE:{requestId}` | pub/sub        | daemon -> adapter          | RPC replies (one channel per in-flight id) |
| `BRIDGE:{roomId}:EVENT`                | pub/sub        | daemon -> adapter          | Push: state/progress/ended/capability      |
| `bridge:{roomId}:presence`             | key w/ TTL 10s | daemon SET EX, adapter GET | Heartbeat (refreshed every 3s)             |

### Message shapes (protocol.ts sketch)

```typescript
import { z } from "zod"

export const bridgeRequestSchema = z.object({
  id: z.string(), // uuid, correlation id
  method: z.enum([
    "play",
    "pause",
    "stop",
    "playTrack",
    "seekTo",
    "getPlayback",
    "setVolume",
    "search",
    "notifyNowPlaying",
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
  // playTrack params: { source: "tidal" | "youtube" | "local", trackId: string, title, artist, album }
  // stop params: { source } - halt the driver and clear its now-playing (empty-queue skip, section 9)
  // setVolume params: { percent } - preferred: Audio Hijack "Music Bus" Volume block (9.1); fallback: active driver
  // notifyNowPlaying (fire-and-forget, no response awaited): { title, artist, album } - sent when the
  // composite routes a track to the Spotify delegate, so the daemon's Now Playing.txt stays correct
})

export const bridgeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("STATE"),
    source: z.string(),
    state: z.enum(["playing", "paused", "stopped"]),
    progressMs: z.number().nullable(),
    durationMs: z.number().nullable(),
  }),
  z.object({ type: z.literal("ENDED"), source: z.string(), trackId: z.string() }),
  z.object({ type: z.literal("CAPABILITIES"), services: z.array(z.string()) }), // handshake + on change
  z.object({ type: z.literal("DISCONNECTING") }), // graceful goodbye
])
```

### Adapter-side client (rpcClient.ts sketch)

```typescript
export class BridgeRpcClient {
  constructor(
    private pub: RedisClientType,
    private sub: RedisClientType,
    private roomId: string,
  ) {}

  async call<T>(method: string, params: object, timeoutMs = 5000): Promise<T> {
    // Short-circuit: no presence key -> daemon offline, fail like Spotify device-not-found
    if (!(await this.pub.get(`bridge:${this.roomId}:presence`))) {
      throw new BridgeOfflineError(this.roomId)
    }
    const id = randomUUID()
    const responseChannel = `BRIDGE:${this.roomId}:RESPONSE:${id}`
    const reply = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new BridgeTimeoutError(method))
      }, timeoutMs)
      const cleanup = () => {
        clearTimeout(timer)
        void this.sub.unsubscribe(responseChannel)
      }
      void this.sub.subscribe(responseChannel, (msg) => {
        cleanup()
        const parsed = JSON.parse(msg)
        parsed.ok ? resolve(parsed.result as T) : reject(new BridgeRemoteError(parsed.error))
      })
    })
    await this.pub.publish(`BRIDGE:${this.roomId}:REQUEST`, JSON.stringify({ id, method, params }))
    return reply
  }
}
```

Daemon side mirrors this: subscribe to `BRIDGE:{roomId}:REQUEST`, dispatch to the router, publish `{ id, ok, result | error }` on the response channel. Note `subscribe`/`publish` need separate Redis connections (duplicate clients), same as [RtmpRoomSubscriber](packages/adapter-rtmp/lib/redisSubscriber.ts) does with `pubClient.duplicate()`.

**Spike (RPC)**: measure round-trip latency through the deployed Redis from a residential connection. Acceptance: p95 < 250ms for `playTrack` (it gates track starts, not keystrokes). Also verify pub/sub behavior across the `rediss://` TLS proxy used in production.

## 4. `packages/adapter-bridge`

### 4.1 Registration and the roomId problem

`AdapterService.getRoomPlaybackController` ([packages/server/services/AdapterService.ts](packages/server/services/AdapterService.ts) 50-134) calls `adapterModule.register(...)` with only name/auth/lifecycle callbacks - **no `roomId`**. Spotify doesn't need it (tokens come via the `getStoredTokens` closure); the bridge does (channels are room-scoped). Two platform nits to fix in the same file:

1. Pass `roomId` into the register config (add optional `roomId?: string` to `PlaybackControllerLifecycleCallbacks` in [packages/types/PlaybackController.ts](packages/types/PlaybackController.ts) - additive, no other adapter affected).
2. `SERVICE_CONFIGS` gates on an OAuth `clientId` (`if (!serviceConfig.clientId) return null`). The bridge has `authentication: { type: "none" }`; relax the guard to skip the clientId check when the registered module's authentication type is `none` (or add a `bridge` entry with a sentinel clientId - the relaxed guard is cleaner).

### 4.2 Composite routing (playbackControllerApi.ts sketch)

The composite needs the room's _Spotify_ controller as delegate. Extract the body of `getRoomPlaybackController` into `getRoomPlaybackControllerByService(roomId, serviceName)` on `AdapterService` (pure refactor; existing method becomes a one-liner) and hand the bridge a resolver at composition root.

```typescript
export function createBridgePlaybackApi(deps: {
  roomId: string
  rpc: BridgeRpcClient
  getSpotifyDelegate: () => Promise<PlaybackControllerApi | null>
  activeSource: ActiveSourceStore // Redis key room:{roomId}:bridge:active_source
}): PlaybackControllerApi {
  const { rpc, getSpotifyDelegate, activeSource } = deps

  return {
    async playTrack(mediaId) {
      // mediaId convention: "{source}:{trackId}", e.g. "youtube:dQw4w9WgXcQ", "spotify:spotify:track:abc"
      const { source, trackId } = parseBridgeMediaId(mediaId)
      // Pause whichever source is currently active before starting the new one (split-brain guard)
      const prev = await activeSource.get()
      if (prev && prev !== source) await pauseSource(prev)
      if (source === "spotify") {
        const delegate = await getSpotifyDelegate()
        if (!delegate) throw new Error("Spotify delegate unavailable")
        await delegate.playTrack(trackId)
      } else {
        await rpc.call("playTrack", { source, trackId })
      }
      await activeSource.set(source)
    },

    async getPlayback() {
      const source = await activeSource.get()
      if (source === "spotify") return (await getSpotifyDelegate())!.getPlayback()
      if (source) return rpc.call("getPlayback", {}) // daemon returns cached driver state
      return { state: "stopped", track: null }
    },

    async pause() {
      /* route to active source, same pattern */
    },
    async play() {
      /* route to active source */
    },
    async seekTo(position) {
      /* route to active source */
    },
    // Preferred (9.1): daemon sets Audio Hijack "Music Bus" Volume block; drivers stay at 100%.
    // Fallback: route to active source / apply-on-playTrack if AH gain is not scriptable.
    async setVolume(v) {
      await rpc.call("setVolume", { percent: v })
    },

    // PluginAPI.skipTrack falls back to skipToNextTrack when the app queue is empty
    // (democracy skip, scratched-cd item, absent-dj). For daemon sources "skip with
    // nothing next" must mean STOP the active driver, not no-op, or audio keeps playing.
    async skipToNextTrack() {
      const source = await activeSource.get()
      if (source === "spotify") return (await getSpotifyDelegate())!.skipToNextTrack()
      if (source) await rpc.call("stop", { source })
      return []
    },

    // App-controlled rooms use the Redis queue; these are unused for bridge rooms:
    async getQueue() {
      return []
    },
    async addToQueue() {
      return []
    },
    async skipToPreviousTrack() {
      return []
    },
  }
}
```

`playTrack`'s `mediaId` comes from the queue item's resource URL. Today `resourceUriFromQueueItem` in [trackAdvanceJob.ts](packages/adapter-spotify/lib/trackAdvanceJob.ts) reads `track.urls[type=resource]`, so the existing extraction keeps working as long as `parseBridgeMediaId` understands each source's resource format:

| Source  | `urls[type=resource]` value                                   | Rationale                                                            |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| spotify | `spotify:track:{id}` (unchanged)                              | Spotify URI, as today; web link comes from `external_urls.spotify`   |
| tidal   | `https://tidal.com/track/{id}` (unchanged from adapter-tidal) | Clickable; id parsed from URL                                        |
| youtube | `https://www.youtube.com/watch?v={videoId}`                   | Clickable in Now Playing (`getExternalUrl`); videoId parsed from URL |
| local   | `local:{navidromeId}`                                         | No public URL exists; non-clickable by design                        |

`parseBridgeMediaId` maps any of these to `{ source, trackId }` (scheme prefixes and known URL shapes). This keeps the Now Playing `LinkOverlay` working for sources that have real web URLs (see 5.2).

### 4.3 Advance loop (bridgeAdvance.ts)

Mirror the shape of Spotify's [createTrackAdvanceJob](packages/adapter-spotify/lib/trackAdvanceJob.ts) (registered from `onRoomCreated`, same operations imports: `popNextFromQueue`, `setDispatchedTrack`, `runBeforePlayQueuedTrack`, emit `QUEUE_CHANGED`), but with two triggers instead of polling Spotify:

1. **Primary - ENDED push**: subscriber on `BRIDGE:{roomId}:EVENT`; on `{ type: "ENDED" }`, run the advance body immediately (pop -> dispatch -> `beforePlayQueuedTrack` -> `playTrack`). Guard with the existing `getDispatchedTrack` check to stay idempotent.
2. **Fallback - 1s cron probe**: same `*/1 * * * * *` cadence; reads the daemon's last `STATE` event from an adapter-side cache (no RPC per tick); advances when `progressMs >= durationMs - 1000` in case an ENDED event was lost. Also feeds `handlePlaybackStateChange` for `SYSTEM:PLAYBACK_STATE_CHANGED` parity (ADR 0060) and `handlePlaybackVolumeChange` (ADR 0069).

When the active source is `spotify`, the Spotify sub-controller is playing - the fallback probe delegates its state read to the Spotify API exactly as today's job does (or simpler: bridge rooms reuse Spotify's own advance job only while active source is spotify; spike the simplest correct arrangement during Phase 1).

### 4.4 Capability cache + availability

`capability.ts` subscribes to `CAPABILITIES` / `DISCONNECTING` events and checks the presence key TTL. Exposes `getAvailableServices(roomId): Set<string>`. Consumers: search fan-out (skip `local` when absent) and a `MEDIA_SOURCE_STATUS_CHANGED`-style surface for the queue UI (emit from an operation per ADR 0014).

## 5. Platform touch-points (complete list)

1. **Enums** ([packages/types/TrackSource.ts](packages/types/TrackSource.ts)): `mediaSourceTypeSchema` += `"tidal" | "youtube" | "local"`; `metadataSourceTypeSchema` += `"youtube" | "local"`.
2. **Queue stamping** ([packages/server/services/DJService.ts](packages/server/services/DJService.ts) ~232): `queueSongAs` hard-codes `mediaSource: { type: "spotify" }`. Change to stamp from the search result's source tag; resource URLs per source follow the table in 4.2 (real web URLs where they exist, `local:{id}` otherwise).
3. **Search fan-out** ([packages/server/handlers/djHandlersAdapter.ts](packages/server/handlers/djHandlersAdapter.ts) ~266): query all of `room.metadataSourceIds` in parallel (`Promise.allSettled`), tag results `{ source }`, then apply **cross-source dedup by priority** (5.1) before returning. Wire shape of `TRACK_SEARCH_RESULTS` gains the tag; web `TrackSearch` shows a service badge.
4. **Registration** ([apps/api/src/server.ts](apps/api/src/server.ts)): add `{ name: "bridge", module: bridgePlaybackController, authentication: noAuth }` to `playbackControllers`; add `local` (RPC-backed) and `youtube` (Data API) metadata sources; allow `playbackControllerId: "bridge"` for radio/live in `configureAdaptersForRoomType` (media source stays `shoutcast`/`rtmp`).
5. **AdapterService** (4.1): pass `roomId` through register; relax clientId guard for `type: "none"`; extract `getRoomPlaybackControllerByService`.
6. **Sidecar payload** (optional but recommended): extend `SYSTEM:NOW_PLAYING_CHANGED` with `mediaSource: { type, trackId }`; [RtmpRoomSubscriber](packages/adapter-rtmp/lib/redisSubscriber.ts) passes it to `submitMediaData` so `handleRoomNowPlayingData` attributes the dispatched queue item exactly. (Radio/ICY stays title-matched - structural, see risks.)
7. **Now-playing hydration** ([handleRoomNowPlayingData.ts](packages/server/operations/room/handleRoomNowPlayingData.ts)): when a dispatched/queued item matches, prefer its search-time `track` over `createRawTrack` and union `metadataSources` - required for youtube/local artwork and links in Now Playing (5.2).
8. **Web UI**: source badges in search results and queue rows; `MetadataSourceInfo` cases + `getExternalUrl` http(s) guard in [NowPlayingTrack.tsx](apps/web/src/components/NowPlaying/NowPlayingTrack.tsx) (5.2). Note: the queue's manual-play path needs **no functional changes** - `PLAY_QUEUED_TRACK` -> `DJService.playQueuedTrack` already resolves the room's controller generically and plays via `track.urls[type=resource]`, which touch-point 2 stamps as `{source}:{trackId}`; same for the header `TOGGLE_PLAYBACK` button. Only Spotify-assuming copy needs genericizing ("Playing on Spotify" toast in `PlaylistItem.tsx`, "Failed to start playback on Spotify" in `DJService`, Spotify tooltips in `QueuedTracksSection.tsx`) - ideally derived from the track's source badge.

Everything else lives in the two new packages.

### 5.1 Cross-source dedup and source priority (bridge concern, configurable)

Spotify and Tidal catalogs overlap heavily. When the same track is available on both, returning two rows is noise and - worse - lets a user queue the Tidal copy when the Spotify copy would play through the tighter, officially-supported Spotify Connect path (and exercise the fragile Tidal driver less). So for bridge rooms, fan-out results are **collapsed**: when results from different sources match by best-available title/artist/album, keep only the highest-priority source's result.

- **Default priority**: `["spotify", "tidal"]` for the overlapping streaming catalogs. Spotify wins ties, so a track on both returns **only** the Spotify result.
- **Configurable**: an ordered `mediaSourcePriority` list so the ranking can flip if Spotify/Tidal integration quality changes (e.g. Tidal API improves, Spotify SDK degrades). Stored as bridge/room config (settled with the room policy shape in Phase 3); the collapse logic reads it, never hard-codes Spotify.
- **Scope**: dedup applies only among catalogs flagged as interchangeable (default `spotify` + `tidal`). `youtube` and `local` are treated as **distinct intent** and pass through even if a fuzzy match exists on a streaming service - a user searching for a YouTube-only mix or their local rip wants that specific item. (Whether local/youtube also participate in collapse is a config toggle, default off.)
- **Matching**: reuse the existing `findBestMatch` scoring from [packages/adapter-tidal/lib/metadataSourceApi.ts](packages/adapter-tidal/lib/metadataSourceApi.ts) (artist+title threshold, album bonus); lift it into a shared util (e.g. `@repo/utils`) so both the Tidal adapter and the bridge dedup use one implementation. ISRC equality, when both sources expose it, is a high-confidence fast path.
- **Where it runs**: server-side in the fan-out step, gated to bridge rooms (or whenever `mediaSourcePriority` is set), so non-bridge rooms keep today's behavior. This is a bridge-owned policy, not a global search change.

**Simplifications this buys**: fewer duplicate search rows; the Tidal driver is only used for Tidal-exclusive tracks (less exposure to its fragility); queue attribution is cleaner (a both-catalogs track is unambiguously `spotify`); export naturally gets the Spotify playlist entry while play-time enrichment still fills the Tidal ID for the Tidal playlist (section 8).

### 5.2 Now Playing display for youtube/local tracks

Trace of the problem: for a YouTube-only track, `resolveTrackData` ([handleRoomNowPlayingData.ts](packages/server/operations/room/handleRoomNowPlayingData.ts)) gets no Spotify/Tidal hits and falls back to `createRawTrack(submission)` - title/artist strings with **no images, no urls, no album**. The dispatched queue item _is_ matched (that is how "Added by" attribution works) and holds the full search-time `MetadataSourceTrack` (YouTube thumbnails included), but today the match is only used for `addedBy`. Result in [NowPlayingTrack.tsx](apps/web/src/components/NowPlaying/NowPlayingTrack.tsx): `getPreferredTrackData` finds neither `metadataSources.spotify` nor `.tidal`, falls back to the raw track, `getCoverUrl` returns null, and the artwork block does not render.

**Fix (small platform touch-point, benefits radio rooms generally): queue-item hydration.** In `handleRoomNowPlayingData`, when a dispatched/queued item is matched, prefer its `track` over the raw fallback (and union its `metadataSources` with enrichment results). The search-time data - which already satisfies `metadataSourceTrackSchema`, artwork included - then flows to the Now Playing panel with no wire or client changes.

Per-concern behavior once hydration is in place:

- **Spotify/Tidal preference toggle** (`usePreferredMetadataSource`): already degrades correctly - `getPreferredTrackData` falls back to the default track when the preferred source bundle is absent. For a YouTube/local-only track the toggle is a no-op; no change required. (Optional nicety: the source picker could gray out sources with no data for the current track.)
- **Artwork**:
  - _YouTube_: thumbnails from Data API `snippet.thumbnails` (or `https://i.ytimg.com/vi/{videoId}/hqdefault.jpg`) are mapped into `album.images` by the YouTube metadata source (6.5), so `getCoverUrl`'s existing `release.album.images` path works unchanged. Thumbnails are 4:3/16:9, not square - `AlbumArtwork` center-crops; acceptable cosmetic difference.
  - _Local_: Navidrome's `getCoverArt` URL is `127.0.0.1` - unreachable from listeners' browsers. The daemon fetches `getCoverArt?id={id}&size=256` locally and embeds it as a **data URI** in `album.images[0].url` (~15-25KB per local track; renders in `img` tags with zero platform changes). Tracks with no embedded art get no artwork block, as today for artless tracks.
- **Title/artist/album lines**: title renders normally; artist = YouTube channel name (or Navidrome artist tag); album is absent for YouTube and conditionally hidden (existing behavior); release date likewise.
- **External link**: `getExternalUrl` prefers `external_urls.spotify` then `urls[type=resource]`. With the resource table in 4.2, YouTube gets a real watch URL (clickable); `local:{id}` is not a URL, so add an http(s) guard in `getExternalUrl` (returns null -> title renders unlinked).
- **"Track data provided by" footer** (`MetadataSourceInfo`): the `getSourceIcon`/`getSourceName` switches only know spotify/tidal; add `youtube` and `local` cases (e.g. `LuYoutube`, `LuHardDrive`) so it does not print the raw enum string.

## 6. Daemon core and drivers

### 6.1 Config and lifecycle

`~/Library/Application Support/bridge-daemon/config.json` (zod-validated):

```json
{
  "redisUrl": "rediss://:password@host:6379",
  "defaultRoomId": "abc123",
  "services": { "youtube": true, "tidal": true, "local": true },
  "chrome": {
    "mode": "launch",
    "debugPort": 9222,
    "profileDir": "~/Library/Application Support/BridgeChrome"
  },
  "navidrome": { "url": "http://127.0.0.1:4533", "user": "dj", "pass": "..." },
  "mpv": { "socket": "/tmp/bridge-mpv.sock" },
  "nowPlayingFile": "~/Now Playing.txt",
  "nowPlayingFormat": "{title} | {artist} | {album}"
}
```

CLI: `bridge-daemon connect [--room {id}]` (defaults to `defaultRoomId`) / `disconnect` / `status`. On connect: start drivers per `services`, publish `CAPABILITIES`, start heartbeat (SET `bridge:{roomId}:presence` EX 10 every 3s), subscribe to that room's request channel. On disconnect: publish `DISCONNECTING`, stop heartbeat, unsubscribe; leave Chrome/mpv/Navidrome running. **Room switching** = disconnect from the old room's channels + connect on the new room's, exposed as a room picker in the Phase 4 shell (can list rooms via the public read-only scheduling API, ADR 0029).

The now-playing format defaults to `Title | Artist | Album` because that is what [adapter-shoutcast](packages/adapter-shoutcast/index.ts) parses from ICY today.

**AudioHijack metadata: single source, by design.** AudioHijack can _capture audio_ from multiple applications at once (Spotify.app + dedicated Chrome + mpv), but it sources _track metadata_ from only **one** application - it cannot read titles from both Chrome and Spotify.app. The bridge sidesteps this entirely: native app metadata detection is not used for any source. The daemon's text file is the sole metadata input - driver events cover tidal/youtube/local, and the `notifyNowPlaying` push (6.8) covers Spotify - so the file is always correct regardless of which app is producing audio. **Setup requirement**: configure AudioHijack's track titles to read from the file/script only, with application metadata detection off (same mechanism `local-remote` uses today).

### 6.2 Driver interface (drivers/Driver.ts)

```typescript
export interface Driver {
  readonly source: "youtube" | "tidal" | "local"
  start(): Promise<void> // acquire tab/socket, report healthy
  stop(): Promise<void>
  healthy(): Promise<boolean>
  load(trackId: string): Promise<void> // begin playback of trackId
  play(): Promise<void>
  pause(): Promise<void>
  seekTo(ms: number): Promise<void>
  setVolume?(percent: number): Promise<void> // required only if AH music-bus spike fails (9.1)
  getState(): Promise<{
    state: "playing" | "paused" | "stopped"
    progressMs: number | null
    durationMs: number | null
  }>
  onEnded(cb: (trackId: string) => void): void
  onStateChange(cb: (state: DriverState) => void): void
  search?(query: string): Promise<MetadataSourceTrack[]> // only local implements this
}
```

Preferred volume path (9.1): RPC `setVolume` is handled by the daemon's Audio Hijack helper, not by drivers. Drivers stay at 100%.

`router.ts` holds the single active driver, pauses the old one before `load` on a new one, forwards driver events to `BRIDGE:{roomId}:EVENT` and to `nowPlaying.ts` (which publishes the Redis sidecar for live rooms and rewrites the text file for radio rooms - the queue item's own title/artist/album, passed along in the `playTrack` params, so the ICY string matches what the server queued by construction).

### 6.3 Chrome management (chrome.ts)

- **Launch mode (default)**: spawn the real Chrome binary with `--user-data-dir={profileDir} --remote-debugging-port={port} --autoplay-policy=no-user-gesture-required --no-first-run`. Dedicated profile keeps logins (Tidal, YouTube Premium) and keeps AudioHijack's per-app capture clean; launched-not-automated, so no `navigator.webdriver` flag.
- **Attach mode**: `puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null })` to a Chrome the DJ started themselves.
- Tab acquisition: find-or-create by URL prefix (`targets()` filter), one tab per driver; health checks re-acquire crashed tabs.

### 6.4 YouTube driver (drivers/youtube.ts + static/youtube.html)

Daemon serves `static/youtube.html` on localhost (e.g. `127.0.0.1:9877`) and opens it as the YouTube tab. The page is ours, so control is the official IFrame Player API, not DOM scraping:

```html
<!-- static/youtube.html (essentials) -->
<div id="player"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
  let player
  function onYouTubeIframeAPIReady() {
    player = new YT.Player("player", {
      height: "390",
      width: "640",
      playerVars: { autoplay: 0, controls: 1 },
      events: {
        onReady: () => window.__bridgeReady && window.__bridgeReady(),
        onStateChange: (e) => window.__bridgeState && window.__bridgeState(e.data), // 0 = ENDED
      },
    })
  }
  // Called by the daemon via page.evaluate:
  window.__load = (id) => player.loadVideoById(id)
  window.__play = () => player.playVideo()
  window.__pause = () => player.pauseVideo()
  window.__seek = (s) => player.seekTo(s, true)
  window.__setVolume = (v) => player.setVolume(v)
  window.__state = () => ({
    t: player.getCurrentTime(),
    d: player.getDuration(),
    s: player.getPlayerState(),
  })
</script>
```

```typescript
// drivers/youtube.ts (essentials)
async start() {
  this.page = await findOrCreateTab(this.browser, "http://127.0.0.1:9877/youtube.html")
  await this.page.exposeFunction("__bridgeState", (s: number) => {
    if (s === 0) this.emitEnded(this.currentTrackId)          // YT.PlayerState.ENDED
    this.emitState(mapYTState(s))
  })
}
async load(videoId: string) { this.currentTrackId = videoId; await this.page.evaluate((id) => window.__load(id), videoId) }
async getState() { return mapState(await this.page.evaluate(() => window.__state())) }
```

Fallback for non-embeddable videos (`status.embeddable` known at search time, carried on the queue item's pluginData or urls): navigate the tab to `youtube.com/watch?v={id}` and control `document.querySelector("video")` via `evaluate`. Alternatively exclude non-embeddable videos from search results (Phase 3 decision).

### 6.5 YouTube search (server-side metadata source)

New metadata source in `adapter-bridge` (or its own tiny package): Data API v3 `search.list` (`part=snippet&type=video&videoCategoryId=10&maxResults=10&q=...`) then one `videos.list` (`part=contentDetails,status&id=...`) batch for ISO-8601 durations and `embeddable`. Map to `MetadataSourceTrack`: `title` = video title, `artists` = `[{ id: channelId, title: channelTitle, urls: [] }]`, `duration` from `PT#M#S`, `urls` includes `{ type: "resource", url: "https://www.youtube.com/watch?v={videoId}" }` (see 4.2 resource table), and `album.images` populated from `snippet.thumbnails` (high/medium) so Now Playing artwork works via the existing `getCoverUrl` path (5.2). Quota: search costs 100 units of the default 10k/day - fine for DJ-scale, note in README.

### 6.6 Tidal driver (drivers/tidal.ts) - the spike

Two candidate hosts, same driver code (both are Chromium targets over CDP):

- **A. Chrome tab at `listen.tidal.com`** (Widevine ships with real Chrome; no fork, no EVS).
- **B. Tidal desktop app launched with `--remote-debugging-port=9223`** (it is Electron; DRM guaranteed to work since it is their own build).

Control strategy, in order of preference (spike determines which layers work per host):

1. **Media element**: `document.querySelector("audio, video")` - if Tidal plays through a scriptable media element, `play()/pause()/currentTime/duration/ended` gives us everything, robust against UI redesigns.
2. **URL navigation to start tracks**: `listen.tidal.com/track/{trackId}` then click the play control (`[data-test="play"]`-style selectors; tidal-hifi maintains a working selector set to crib from).
3. **`navigator.mediaSession` metadata** for state verification.
4. Keyboard shortcuts via `page.keyboard` as a last-resort control layer.

Track ids come from the existing `adapter-tidal` search results (same catalog ids as the web player). **Spike acceptance**: start a specific track by id, pause/resume, observe ended, survive an app restart, measure time-to-first-audio. Also opportunistically test a Spotify web tab in host A (real Chrome removes the Widevine barrier; Spotify's server-side gating is the open question).

### 6.7 Local driver (drivers/local.ts): Navidrome + mpv

- **Navidrome** runs standalone (`brew install navidrome` or bundled binary later), pointed at the music folder; its web UI is the library-management surface.
- **Search**: Subsonic `search3` - `GET {url}/rest/search3?query=...&songCount=20&f=json&u={user}&t={md5(pass+salt)}&s={salt}&v=1.16.1&c=bridge`. Map `song` entries to `MetadataSourceTrack` (`id`, `title`, `artist`, `album`, `duration`), resource URL `local:{id}`. Cover art: fetch `getCoverArt?id={id}&size=256` locally and embed as a data URI in `album.images[0].url` (Navidrome's URL is localhost-only and unreachable from listeners' browsers - see 5.2). Served to the platform via the daemon RPC `search` method, registered as the `local` metadata source (RPC-backed) in the fan-out.
- **Playback**: mpv spawned once: `mpv --idle=yes --no-video --input-ipc-server=/tmp/bridge-mpv.sock`. JSON IPC over the UNIX socket:

```typescript
// load: stream URL with auth params, exact and DRM-free
send({ command: ["loadfile", `${url}/rest/stream?id=${trackId}&${authParams}`] })
send({ command: ["set_property", "pause", true] }) // pause
send({ command: ["seek", ms / 1000, "absolute"] }) // seekTo
send({ command: ["set_property", "volume", percent] }) // setVolume
send({ command: ["observe_property", 1, "time-pos"] }) // progress events
// ended: { "event": "end-file", "reason": "eof" } on the socket
```

Alternative considered: Navidrome's built-in jukebox mode (Subsonic `jukeboxControl`, uses mpv internally) - less daemon code but coarser control and no direct ended events; direct mpv preferred. **Spike acceptance**: search -> stream -> exact `end-file` event; confirm AudioHijack captures mpv as its own source.

### 6.8 Spotify (no driver)

`spotify:*` tracks never reach the daemon for playback: the composite delegates to the existing Spotify controller and Spotify.app plays. **Decided**: the adapter sends a fire-and-forget `notifyNowPlaying` request (title/artist/album from the queue item) whenever it routes to the Spotify delegate, so `nowPlaying.ts` writes the same text file and publishes the same sidecar regardless of which source is playing - one code path, no AppleScript watcher.

## 7. Service availability: room policy vs session capability

- **Room config = policy** (persisted, admin-set): which services this room offers, plus the `mediaSourcePriority` ordering used for cross-source dedup (5.1); drives search fan-out and queueability independent of the Mac. Modeled as room settings alongside `metadataSourceIds` (exact shape is a Phase 3 decision).
- **Daemon session = capability** (dynamic): which drivers are operational, from the `CAPABILITIES` handshake + heartbeat. Menu-bar/CLI toggles mutate the reported set.

Effective availability = policy INTERSECT capability. Platform skips unavailable sources in fan-out, badges degraded services, warns when queueing from a down service. Daemon offline degrades to server-side sources (Spotify playback + Spotify/Tidal/YouTube search).

### Connect/disconnect (explicit presence)

Connecting is deliberate (menu-bar toggle, CLI). Connected: handshake, RPC serviced, events pushed, sidecar published, text file written, heartbeat refreshed. Graceful disconnect: `DISCONNECTING` message first, so availability flips immediately; local processes stay up. Crash: heartbeat TTL lapse, same end state. While away: daemon-routed `playTrack` fails like Spotify device-not-found, `getPlayback` reports only the Spotify sub-controller, fan-out drops `local`.

## 8. Room export: Spotify / Tidal playlists

Post-show publish already creates native Spotify and Tidal playlists ([ADR 0024](docs/adrs/0024-post-show-publish-and-archive-flow.md), [`continuePrepareShowPublish`](packages/server/operations/showPublish.ts)). Bridge rooms reuse that path; the only design work is making skip behavior correct and visible when the playlist mixes Spotify, Tidal, YouTube, and local tracks.

### 8.1 Existing mechanism (already correct for "skip unavailable")

On `POST .../publish/continue`, for each of `spotify` and `tidal`:

1. Resolve the room creator's `MetadataSource` for that service (OAuth).
2. Map curated playlist items through `extractServiceTrackId(item, svc)`:

```66:75:packages/server/operations/showPublish.ts
function extractServiceTrackId(item: QueueItem, service: "spotify" | "tidal"): string | null {
  const bundle = item.metadataSources?.[service]
  if (bundle?.track?.id) {
    return bundle.track.id
  }
  if (item.metadataSource?.type === service && item.track?.id) {
    return item.track.id
  }
  return null
}
```

3. Filter out `null` → those tracks are omitted from that service's playlist.
4. Call `MetadataSourceApi.createPlaylist` with the remaining IDs (non-blocking per service; failure continues without that link).
5. Markdown export still lists **all** curated tracks (including YouTube/local); only the OAuth playlists are a subset. Frontmatter gets `spotifyPlaylist` / `tidalPlaylist` URLs when created.

There is no YouTube (or local) `createPlaylist` in this loop — intentional. YouTube/local tracks appear in the Markdown archive only.

### 8.2 How bridge tracks get Spotify/Tidal IDs (or don't)

| Queued / played from | Spotify playlist ID source                | Tidal playlist ID source                          | If missing                  |
| -------------------- | ----------------------------------------- | ------------------------------------------------- | --------------------------- |
| Spotify search       | primary `metadataSource` / `track.id`     | `metadataSources.tidal` from play-time enrichment | omit from that service      |
| Tidal search         | `metadataSources.spotify` from enrichment | primary `metadataSource` / `track.id`             | omit                        |
| YouTube              | `metadataSources.spotify` from enrichment | `metadataSources.tidal` from enrichment           | omit (usual for YT-only)    |
| Local library        | same via enrichment                       | same via enrichment                               | omit (usual for local-only) |

Play-time enrichment already runs in [`resolveTrackData`](packages/server/operations/room/handleRoomNowPlayingData.ts): when now-playing is submitted (Shoutcast ICY or `SYSTEM:NOW_PLAYING_CHANGED`), the server calls `searchByParams` on every configured room metadata source and stores hits under `QueueItem.metadataSources`. That is the same pipeline bridge rooms use once the daemon writes now-playing text / Redis sidecar.

**Decision (matches your assumption):** tracks with no Spotify ID are skipped from the Spotify playlist; same for Tidal. No attempt to invent IDs. No YouTube playlist export.

### 8.3 Gaps the bridge introduces (and the fix)

1. **Enrichment quality for YouTube/local titles** — YouTube titles are messy (`Artist - Title (Official Video)`). Enrichment depends on `searchByParams` matching; false negatives mean more skips than ideal. Mitigation: when the daemon publishes now-playing, prefer the **queue item's** title/artist/album (already planned in 6.2) over the YouTube page title, so enrichment gets clean strings.
2. **Enrichment only at play time** — a track that never makes it into the played playlist history is out of scope for OAuth playlists (existing publish behavior). Curated review still only includes played/history items the admin syncs.
3. **Export-time backfill (recommended Phase 3)** — before `createPlaylist`, for any curated item missing a Spotify or Tidal ID, run a best-effort `searchByParams` against that service using the item's title/artist/album and, on a high-confidence match, use that ID for this export only (optionally persist into `metadataSources` on the durable `room_playlist_track` row). Keeps skips correct while recovering tracks that enrichment missed at play time. Cap concurrency; continue on failure.
4. **Scheduler UX** — on the playlist review / continue step, show per-service counts: e.g. "Spotify: 42 of 55 tracks · 13 skipped (no Spotify match)" and the same for Tidal. Optional: badge rows that will be skipped. Do not block publish if a service gets zero tracks (skip creating that playlist, as today when `trackIds.length === 0`).
5. **`extractServiceTrackId` and new mediaSource types** — no change required: it never reads `mediaSource.type` for catalog IDs. Widening `mediaSourceTypeSchema` with `youtube` / `local` / `tidal` does not break export. Durable snapshot fields (`mediaSourceType`, `spotifyTrackId`, `tidalTrackId` in `showPublish`) already store the extracted IDs; youtube/local media sources simply leave both null when unmatched.

### 8.4 What stays out of scope

- Creating a YouTube playlist (no first-party equivalent that fits `createPlaylist` cleanly; Markdown + per-track YouTube links in the archive are enough).
- Requiring every exported track to exist on both Spotify and Tidal.
- Changing Markdown to hide skipped-from-streaming tracks — the archive should remain a complete show history.

## 9. Platform feature audit: what else the bridge touches

Full survey of server features, web features, and plugins against the bridge design. Most of the platform keys off `mediaSource.trackId` and generic `QueueItem` fields, so it works unchanged; the gaps below are everything found beyond the search/queue/now-playing/export work already planned.

### Works unchanged (verified, no action)

- **Reactions** - keyed by `{ type: "track", id }`; youtube/local track ids are stable and non-colliding.
- **Chat, polls, bookmarks, typing, mentions, personas** - no media-source dependency.
- **Plugins: playlist-democracy, special-words, absent-dj, queue-hygiene, loyalty, quiz-sessions** - operate on `mediaSource.trackId`, chat, or queue order; `skipTrack` flows through `PluginAPI` -> composite `playTrack` with the 4.2 resource formats.
- **Item-shops** - scratched-cd skips via `mediaSource.trackId`; beer/seltzer promote/demote find queue rows by `track.id` (videoId / Navidrome id: stable, unique).
- **Queue-pacer** - needs accurate `track.duration` (YouTube Data API + Navidrome both provide it) and `PLAYBACK_STATE_CHANGED` events (fed by the 4.3 probe).
- **Queue dedupe / removal / reorder** - `canonicalQueueTrackKey` = `{type}:{trackId}`; new types slot in. Same track queued from Spotify and YouTube is two entries by design (distinct intent, 5.1).
- **Guess-the-tune** - matches on title/artist/album strings from the (hydrated, 5.2) queue item. Caveat: raw YouTube titles ("Artist - Title (Official Video)") make fuzzy guessing noisy; acceptable, admins curating GTT rounds should favor catalog sources.
- **Save-playlist selectability** ([SelectablePlaylistItem.tsx](apps/web/src/components/SelectablePlaylistItem.tsx)) - eligibility already requires `metadataSources[service].trackId`; unenriched youtube/local tracks are correctly unselectable.
- **Export** (`extractServiceTrackId`) - never reads `mediaSource.type`; covered in section 8.

### Gaps with fixes (folded into touch-points/phases)

1. **Empty-queue skip stops playback** - `PluginAPI.skipTrack` ([PluginAPI.ts](packages/server/lib/plugins/PluginAPI.ts) ~147) falls back to `skipToNextTrack()` when the queue is empty. The composite implements it as "stop the active daemon source" (4.2 sketch updated); a no-op would leave a democracy-skipped YouTube track playing.
2. **Volume coherence across sources** - prefer Audio Hijack music-bus Volume block if Phase 0 spike succeeds; else per-driver `setVolume` with apply-on-`playTrack` (9.1). Update volume-manager's Spotify-specific schema copy.
3. **Advance job cleanup** - [cleanupRooms.ts](packages/server/jobs/rooms/cleanupRooms.ts) ~95 pauses `spotify-player-{roomId}` only when `mediaSourceId === "spotify"`. The bridge advance job registers as `bridge-player-{roomId}` and gets an equivalent pause branch for bridge rooms, or it polls forever in empty rooms.
4. **Add-to-library target guard** - [ButtonAddToLibrary.tsx](apps/web/src/components/ButtonAddToLibrary.tsx) with no preference set uses `nowPlaying.metadataSource.type` as `targetService` - for a YouTube-primary track that emits `ADD_TO_LIBRARY` with `targetService: "youtube"`. Guard to library-capable services (spotify/tidal); hide the heart otherwise. With a preference set it already hides correctly.
5. **local-remote double-publisher conflict** - until Phase 4 absorbs it, `local-remote`'s AppleScript Now Playing watcher and the bridge daemon would both publish `SYSTEM:NOW_PLAYING_CHANGED` (and write Now Playing.txt) for the same room. Operational rule, documented in both READMEs: disable local-remote's NP toggle for bridge rooms (config UI toggle already exists).
6. **Studio parity** (per AGENTS.md) - [studio-bridge](apps/studio-bridge) stubs and [game-studio](apps/game-studio) sample data (`sampleQueueTracks.json`, `mockStudioPluginApi.ts` `addToQueue`) stamp everything `spotify`. When Phase 3 adds source badges, add youtube/local sample queue items and widen the mock's stamping so Game Studio previews render badges.
7. **Dynamic theme color extraction** - `useDynamicTheme` samples the artwork URL via canvas; needs CORS-readable images. Verify `i.ytimg.com` thumbnails (generally CORS-enabled) and data-URI local art (same-origin, safe) during Phase 1; fall back to the static theme if tainted.

### 9.1 Volume: Audio Hijack music bus (preferred) vs per-driver fallback

**Preferred: one broadcast-bus fader in Audio Hijack.** Volume Manager already models one room-level value (live + track-start reset, ADR 0069). For bridge rooms the broadcast mix is what listeners hear, so that value should move a single fader after Spotify.app + Chrome + mpv are mixed — not each player's internal volume. (Operator routing — e.g. Loopback in the AH session — stays outside this plan.)

**Preferred topology**

```
Spotify.app ──┐
Chrome ───────┼──► [Volume "Music Bus"] ──► Shoutcast / RTMP output
mpv ──────────┘
Mic / talk ───────────────────────────────► (separate path; unducked by music-bus changes)
```

Daemon config: `audioHijack: { sessionName, volumeBlockName }` (defaults e.g. `"Listening Room"`, `"Music Bus"`). Bridge `setVolume(percent)` → daemon RPC → Audio Hijack JS script that sets that named block. Drivers (and Spotify Connect for bridge rooms) stay at **100%** so there is no double attenuation and no apply-on-`playTrack` dance. `supportsVolumeControl` is true when the block is reachable; `PLAYBACK_VOLUME_CHANGED` reflects the last value the daemon set (external Spotify phone volume is ignored for bridge — correct, since it does not change the broadcast).

**Why this beats per-provider control**

- One source of truth matches volume-manager's model.
- Source switches never jump loudness.
- Segment talk ducking ducks the whole music mix, not only Spotify.
- Drivers stay dumb on volume (YouTube IFrame / Tidal / mpv never need `setVolume` for product features).

**Hard constraint — must spike in Phase 0.** Audio Hijack's public scripting API ([AH-Scripting-API](https://www.rogueamoeba.com/support/knowledgebase/?showArticle=AH-Scripting-API)) documents only `name` / `type` / `disabled` on blocks. Samples can toggle blocks on/off; **block gain/volume is not documented**. Triggering is via `.ahcommand` / Shortcuts with "Allow execution of external scripts" enabled — not AppleScript against AH itself. Spike acceptance:

1. Create a session with a named Volume block after a multi-app mix.
2. From the daemon (or a one-shot `.ahcommand`), set that block to 40% and 100% and confirm the broadcast level changes.
3. If the property exists under an undocumented name, record it; if not, **fallback**.

**Fallback if the spike fails:** per-driver `setVolume` (daemon applies last room volume on each `playTrack`; Spotify delegate when active). Same PluginAPI surface either way — only the bridge controller's `setVolume` implementation changes.

**Out of scope / unchanged:** non-bridge jukebox rooms keep Spotify Connect `setVolume`. Do not GUI-script Audio Hijack.

### Known limitations (documented, deferred)

- **Scheduler segment tracks are Spotify-only**: `SchedulingService` hard-codes `mediaSourceType: "spotify"` (~420) and the segment picker searches only `GET /scheduling/spotify/search`. Scheduled segments cannot inject YouTube/local tracks in v1. Later: point the picker at the same fan-out search and store `{ mediaSourceType, mediaSourceTrackId }` generically ([injectSegmentTracksToQueue.ts](packages/server/operations/injectSegmentTracksToQueue.ts) already falls back to `mediaSourceTrackId`).
- **Spotify-named legacy surface** (`spotifyError` Redis field, `enableSpotifyLogin`, `SEARCH_SPOTIFY_TRACK`, `playbackMode: "spotify-controlled"`, Spotify-worded error strings in `DJService`) - naming debt, functionally harmless for bridge rooms. Genericize copy opportunistically (touch-point 8); no schema renames in this project.
- **Guest Spotify login / listener library features** - unrelated to playback source; unchanged.

## 10. Risks (ordered by severity)

- **Tidal driver fragility**: DOM/selector changes; session loss across restarts. Mitigation: media-element-first control, driver isolation, health checks, "service unavailable" surfaced via capability events, **and Spotify-first dedup (5.1) so Tidal playback is only used for Tidal-exclusive tracks**.
- **Browser lifecycle supervision**: Chrome not running, crashed tab, logged out, auto-updated. Attach-or-launch + health checks in the daemon; Electron shell packages it in Phase 4.
- **Advance timing**: driver `ended` events are primary (mpv and YT give exact events); 1s progress probe is the safety net. Verify no double-advance via the existing `dispatched_track` guard.
- **Spotify split-brain**: composite pauses the previous source before starting a new one; `activeSource` is Redis-persisted so any API instance routes consistently.
- **Now-playing attribution on radio**: ICY is text-only; correctness depends on the daemon writing the queue item's own strings (6.2) so server-side matching is exact-by-construction. Sidecar payload extension (5.6) fixes live rooms outright.
- **Export enrichment misses**: YouTube/local tracks that also exist on Spotify/Tidal may be skipped from OAuth playlists if play-time matching fails; mitigated by clean queue-item metadata for ICY/sidecar + optional export-time backfill (8.3).
- **Audio capture hygiene**: dedicated Chrome + mpv + Spotify.app into a named music-bus Volume block when AH scripting works (9.1); operator's existing AH/Loopback session otherwise.
- **Audio Hijack volume scripting**: public JS API docs omit block gain; Phase 0 spike may force fallback to per-driver `setVolume`.
- **Daemon vs local-remote language**: Node chosen (puppeteer, `@repo/types`); Phase 4 absorption of local-remote's OSC/soundboard is a port, not a merge.

## 11. Phasing

- **Phase 0 - ADR + spikes**: ADR for composite controller + RPC protocol + driver pattern. Spikes with acceptance criteria: Tidal hosts (6.6), Navidrome/mpv (6.7), RPC latency (3), **Audio Hijack Volume-block scripting (9.1)**.
- **Phase 1 - DRM-free end-to-end**: `adapter-bridge` (RPC client, composite API, advance loop, capability cache, AdapterService touch-points) + headless daemon (config, presence, router, YouTube + local drivers); enum widening + queue stamping; now-playing queue-item hydration + `NowPlayingTrack` touches (5.2) so YouTube/local tracks show artwork, links, and source attribution; audit fixes from section 9: composite stop-on-empty-skip, `bridge-player-{roomId}` cleanup branch, volume via AH music bus (or per-driver fallback) + `supportsVolumeControl` (9.1), add-to-library target guard, dynamic-theme CORS check, local-remote NP toggle documented off. Play a YouTube + local mix in a **radio room** with Now Playing.txt -> ICY; verify against a live room's RTMP path. Confirm played tracks land in Redis playlist history with clean title/artist for later export enrichment.
- **Phase 2 - Tidal + Spotify composition**: Tidal driver on the spike-chosen host; Spotify delegation with active-source pause coordination; Spotify now-playing via `notifyNowPlaying` (6.8).
- **Phase 3 - Search fan-out + policy + export**: parallel multi-source search with source tags, web UI badges, **cross-source dedup with configurable `mediaSourcePriority` (5.1, shared `findBestMatch` util)**, room-level service policy settings, YouTube search placement finalized (server-side Data API recommended), non-embeddable video policy; **studio parity**: youtube/local sample queue items in game-studio + studio-bridge, generic stamping in `mockStudioPluginApi.addToQueue` (section 9); **export**: skip-count UX in the scheduler publish playlist step, optional export-time `searchByParams` backfill for missing Spotify/Tidal IDs (8.3).
- **Phase 4 - Electron supervisor shell + packaging (section 12)**: menu-bar app wrapping the daemon core (attach-or-launch, health UI + notifications, session toggles, bundled Navidrome/mpv); signed/notarized `.dmg` + `electron-updater`; absorb `local-remote` (config UI, Farrago OSC/soundboard); retire the AppleScript now-playing watcher.
  - **Notes (2026-07-20):** Electron packaging remains deferred. Shipped interim operator surface: localhost HTTP UI + Redis room list + full `config.json` editing (`bridge-daemon serve`, ADR 0073) — same pattern as local-remote, not a public API.

## 12. Packaging, install, and updates

**Short answer:** Phases 1–3 are developer-install (not simple). Phase 4 makes the recommended path a single menu-bar app: drag a `.dmg`, keep config across updates, auto-update in the background. Chrome, Spotify.app, and Audio Hijack stay external (you already have them).

### Two eras

| Era                       | Install                                                                                                                                                                                                                             | Update                                                                                                                                                                             | Audience               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Phases 1–3** (headless) | Clone monorepo → `npm install` → `npm run dev -w bridge-daemon` (or a thin `node dist/index.js`). External: Chrome, Spotify, `brew install mpv navidrome` (or equivalent). Config at `~/.config/listening-room-bridge/config.json`. | `git pull` + rebuild.                                                                                                                                                              | You during development |
| **Phase 4** (recommended) | Download signed + notarized **Listening Room Bridge.app** `.dmg` → Applications. First launch: Redis URL, default room, services, Now Playing.txt path, AH volume-block names if used. LaunchAgent optional ("Open at login").      | In-app **auto-update** via `electron-updater` (or equivalent) against GitHub Releases; prompts to restart. Config stays in `~/Library/Application Support/Listening Room Bridge/`. | Day-to-day DJ Mac      |

### What the Phase 4 app contains

- Electron **supervisor shell only** (menu bar: connect/disconnect, room picker, health, logs) — not a playback runtime (no DRM in Electron).
- Bundled Node daemon core (same `apps/bridge-daemon` code, packaged with the app).
- Bundled **mpv** + **Navidrome** binaries (arm64 + x64 universal or separate builds) so local library works without Homebrew.
- Does **not** bundle: Google Chrome, Spotify.app, Audio Hijack, Loopback — documented prerequisites; daemon attach-or-launches Chrome from a well-known path (`/Applications/Google Chrome.app`).

### Update simplicity (Phase 4)

- CI builds `.dmg` on tag → GitHub Release with `latest-mac.yml` (electron-builder).
- App checks on launch / every N hours; downloads in background; "Restart to update".
- Migrations for `config.json` are additive (zod defaults); never wipe operator settings on update.
- No Homebrew requirement for the happy path after Phase 4.

### What stays intentionally not automated

- Chrome / Spotify / AH account logins and session layout (Loopback, Music Bus block names).
- Redis URL and room choice (first-run or menu).
- Signing & notarization Apple Developer account + CI secrets (one-time setup cost).

### Dev escape hatch (kept forever)

`apps/bridge-daemon` remains runnable from the monorepo for spikes and debugging, even after the `.dmg` ships. The shell invokes the same core; no second implementation.
