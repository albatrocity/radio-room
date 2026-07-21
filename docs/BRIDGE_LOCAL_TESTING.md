# Local testing: Media Bridge (Phases 1–3)

Steps to run the bridge adapter + Mac daemon against your Docker Listening Room stack.

## Prerequisites

- Docker Compose stack running (API, Redis, web, Postgres as you usually do)
- Node 22+
- Google Chrome installed at `/Applications/Google Chrome.app`
- (Optional local library) [Navidrome](https://www.navidrome.org/) + [mpv](https://mpv.io/) (`brew install navidrome mpv`)
- (Optional Tidal) TIDAL desktop app installed
- Spotify Premium account linked to the room creator (unchanged)
- Audio Hijack / Loopback session capturing Chrome + Spotify (+ mpv if used)

## 1. Google Cloud — YouTube Data API key

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable **YouTube Data API v3**
4. Create an API key (APIs & Services → Credentials)
5. Restrict the key to YouTube Data API v3 if you like
6. Export for the API process:

```bash
export YOUTUBE_API_KEY="your-key-here"
```

Add the same variable to your Docker API service env (compose override or `.env` used by the API container).

## 2. Install monorepo deps

From the repo root:

```bash
npm install
```

New workspaces: `@repo/adapter-bridge`, `bridge-daemon`.

## 3. Configure the bridge daemon

```bash
npm run init-config -w bridge-daemon
# or: npx tsx apps/bridge-daemon/src/index.ts init-config
```

Edit `~/.config/listening-room-bridge/config.json`:

```json
{
  "redisUrl": "redis://127.0.0.1:6379",
  "defaultRoomId": "YOUR_ROOM_ID",
  "services": ["youtube", "local", "spotify"],
  "chrome": {
    "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "debuggingPort": 9222
  },
  "navidrome": {
    "url": "http://127.0.0.1:4533",
    "username": "your-navidrome-user",
    "password": "your-navidrome-password"
  },
  "mpv": { "path": "/opt/homebrew/bin/mpv" },
  "nowPlayingPath": "/Users/YOU/path/to/Now Playing.txt"
}
```

**Spotify Web Playback SDK (opt-in):** Include `"spotify"` in `services` to host a Connect device in bridge Chrome (see [ADR 0076](adrs/0076-spotify-web-playback-sdk-device.md)). The room creator must **re-link Spotify** once so the OAuth token includes the `streaming` scope. Without `"spotify"` in services, behavior stays on Spotify.app. SDK audio is ~256kbps AAC (fine for a transcoded stream).

The daemon always writes Audio Hijack’s labeled format (same as local-remote):

```text
Title: Song Title
Artist: Artist Name
Album: Album Name
```

In Audio Hijack’s Broadcast/Live Stream block, set **Track Source** to that file (“Other Source…”) and set **Title Format** to something like `{title} | {artist} | {album}` — that format belongs in AH, not in the text file.

**Redis URL:** If Redis is only inside Docker, publish port `6379` to the host (usual for local compose) or use `host.docker.internal` from containers and `127.0.0.1` from the Mac daemon.

**Now Playing.txt:** Point Audio Hijack’s title source at this file (application metadata detection off). Disable **local-remote** Now Playing for this room so you don’t double-publish.

**Tidal (Phase 2):** add `"tidal"` to `services` and ensure TIDAL.app is installed. First connect launches it with `--remote-debugging-port=9223`.

**YouTube Error 153:** The daemon serves `youtube.html` over `http://127.0.0.1:18765` (not `file://` / `setContent`). If you still see “Video player configuration error”, quit the Chrome instance the daemon launched (or close tabs on `:9222`) and reconnect so it loads the HTTP host page.

## 4. Create / configure a bridge room

Room must be **radio** or **live**, **app-controlled**, with:

| Field | Value |
|-------|--------|
| `playbackControllerId` | `bridge` |
| `mediaSourceId` | `shoutcast` (radio) or `rtmp` (live) |
| `metadataSourceIds` | e.g. `["spotify","tidal","youtube","local"]` |
| `playbackMode` | `app-controlled` |

Bridge rooms auto-add `youtube` (when `YOUTUBE_API_KEY` is set) and `local` on create. For an existing room that only has Spotify/Tidal:

```bash
docker compose exec redis redis-cli HSET room:YOUR_ROOM_ID:details metadataSourceIds '["spotify","tidal","youtube","local"]'
```

Restart the API after env / adapter registration changes so `@repo/adapter-bridge` is loaded.

## 5. Start the daemon

**Recommended:** local control UI (room picker + full config editor):

```bash
npm run serve -w bridge-daemon
# open http://127.0.0.1:18766/
```

Pick a room marked **bridge** (listed from Redis — no copy/paste). Edit `redisUrl`, services, Chrome/Tidal/Navidrome/mpv paths, Now Playing path, etc., then **Save config**. Connect/disconnect from the Session / Rooms sections.

CLI alternatives:

```bash
npm run rooms -w bridge-daemon          # list rooms from Redis
npm run connect -w bridge-daemon -- --room YOUR_ROOM_ID
npm run connect -w bridge-daemon -- --room YOUR_ROOM_ID --ui   # connect + UI
```

Leave the process running. You should see connected drivers listed.

First Chrome launch uses a dedicated profile under `~/.config/listening-room-bridge/chrome-profile`. Sign into **YouTube Premium** in that window (avoids ads on the broadcast).

## 6. Audio Hijack

- Capture: Chrome (bridge profile) for YouTube (+ Spotify when SDK device is enabled); mpv if using local. With `"spotify"` in daemon `services`, you can drop the Spotify.app tile.
- Metadata: **Track Source** = the daemon’s Now Playing.txt (Other Source…). Turn off application metadata detection.
- **Title Format** in AH (e.g. `{title} | {artist} | {album}`) controls the stream string; the file itself must use `Title:` / `Artist:` / `Album:` lines
- Volume: per-driver via Volume Manager plugin (v1); optional AH Volume-block scripting is not required

## 7. Smoke test checklist

1. Open the room in the web app
2. Search for a track — results should show **source badges** (Spotify / YouTube / …)
3. Queue a **YouTube** result; press Play on the queue row
4. Confirm Chrome plays the video; Now Playing.txt updates; room Now Playing shows title + thumbnail
5. Queue a Spotify track:
   - **With SDK device** (`"spotify"` in services): quit Spotify.app; confirm audio plays in the bridge Chrome tab and Now Playing.txt updates. Daemon logs should show `[spotify-device] ready device_id=…`.
   - **Without SDK device**: confirm Spotify.app plays as before
6. (Optional) Queue a local Navidrome track; confirm mpv audio and artwork (data URI)
7. Empty the queue and trigger a democracy skip / scratched-cd — active daemon source should **stop**
8. As room admin, use the **Now Playing scrubber** to seek within the track; with Volume Manager enabled, use its **broadcast volume** slider in Now Playing to change driver volume

## 8. Export / publish

Post-show publish still creates Spotify/Tidal playlists from `metadataSources` IDs. YouTube/local-only tracks are skipped for those playlists (Markdown archive still lists them). Enrichment quality depends on clean title/artist from the queue item.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| YouTube search empty | `YOUTUBE_API_KEY` on API; quota; API enabled |
| `Bridge daemon not connected` | Daemon `connect` running; same `redisUrl` / room id; presence key TTL |
| No artwork for YouTube | Queue-item hydration; thumbnail URL CORS for dynamic theme |
| Local search empty | Navidrome creds; daemon includes `local`; RPC `search` |
| Tidal won’t start | App path; CDP port 9223 free; login inside Tidal app |
| Double Now Playing | Turn off local-remote NP for this room |
| Stream metadata is ` \| \| ` | File must be `Title:`/`Artist:`/`Album:` lines (not `{title} \| {artist}`). Put the pipe format in AH Title Format. |
| YouTube “Video unavailable” hangs | Reconnect daemon (error/watchdog → ENDED → auto-advance). Some videos can’t embed; they’ll skip. |
| Spotify SDK `TOKEN_REQUEST` loops / auth failed | Restart API so bridge `onRoomCreated` wires token provisioning; re-link Spotify for `streaming` scope (refresh alone does not add scopes); Premium required; check API logs for `[bridge-spotify-token]` |
| Spotify still needs Spotify.app | Remove `"spotify"` from daemon `services` to use legacy Connect, or verify `bridge:{room}:spotify_device` exists in Redis |

## Out of scope (this build)

- Phase 4 Electron `.dmg` / auto-update (deferred; localhost UI is ADR 0077)
- Audio Hijack Volume-block scripting (per-driver volume first)
- Scheduler segment tracks for YouTube/local
