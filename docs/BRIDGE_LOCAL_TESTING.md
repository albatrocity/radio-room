# Local testing: Media Bridge (Phases 1–3)

Steps to run the bridge adapter + Mac daemon against your Docker Listening Room stack.

## DJ Mac handoff (production-shaped)

On a **build Mac** with the monorepo, produce one zip — no Rust/npm on the DJ Mac ([ADR 0084](adrs/0084-dj-mac-single-zip-supervised-bridge.md)):

```bash
npm run pack:dj-mac
# → dist/listening-room-dj-mac-darwin-x64.zip
```

`pack:dj-mac` runs `npm run bundle -w bridge-daemon`, which writes **gitignored** `apps/bridge-daemon/dist-bundle/` (`daemon.cjs`, static/ui, package.json). Do not commit that folder; regenerate via pack or `npm run bundle -w bridge-daemon` when you need the artifact locally.

AirDrop → unzip/replace → if Gatekeeper blocks: `xattr -dr com.apple.quarantine listening-room-dj-mac`. Audio Hijack starts **only** `local-remote`. Operator UI: **http://127.0.0.1:9876/** (enable **Media Bridge** there). Configs live outside the zip under `~/Library/Application Support/local-remote/` and `~/.config/listening-room-bridge/`.

The sections below are for **dev from source** (`npm run serve -w bridge-daemon`). Prefer the pack on the real DJ Mac.

## Prerequisites

- Docker Compose stack running (API, Redis, web, Postgres as you usually do)
- Node 22+ (dev from source only; the DJ Mac pack bundles Node)
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
    "password": "your-navidrome-password",
    "musicFolder": "/Users/YOU/Music/Library",
    "publicUrlTagPriority": [
      "wcom", "wpay", "woaf", "woas", "wxxx", "woar",
      "purchaseurl", "bandcamp", "url", "website",
      "comment", "musicbrainz"
    ]
  },
  "mpv": { "path": "/opt/homebrew/bin/mpv" },
  "nowPlayingPath": "/Users/YOU/path/to/Now Playing.txt"
}
```

**Local track links (purchase / source URL):** Set `navidrome.musicFolder` to the same absolute MusicFolder Navidrome scans. The daemon reads URL tags from each file and adds the first valid public `http(s)` URL to the track metadata (so Now Playing artwork/title can open Bandcamp, etc.). Opaque `local:{id}` stays for bridge identity.

Recommended tags for library managers:

| Prefer | Tag | Example |
|--------|-----|---------|
| Best (MP3) | ID3 **WCOM** (commercial / buy) | Bandcamp album or track URL |
| Best (FLAC) | Vorbis **`PURCHASEURL`** or **`BANDCAMP`** | same |
| Also fine | **WXXX** with description `Bandcamp`, **WOAF**, **WPAY** | |
| Artist site | **WOAR** / Vorbis **WEBSITE** | Lower priority by default |
| Fragile | Comment field containing a public URL anywhere in the text | First public URL is used only if nothing else matches |

`publicUrlTagPriority` controls which tag wins when several are present. Default is purchase-oriented (`wcom` first). To prefer official artist pages after testing:

```json
"publicUrlTagPriority": [
  "woar", "website", "wcom", "wpay", "woaf", "woas", "wxxx",
  "purchaseurl", "bandcamp", "url", "comment", "musicbrainz"
]
```

Tokens: `wcom`, `wpay`, `woaf`, `woas`, `wxxx`, `woar`, `purchaseurl`, `bandcamp`, `url`, `website`, `comment`, `musicbrainz`. Omit the array to use the default. Without `musicFolder`, file tags are skipped (OpenSubsonic comment / MusicBrainz id can still supply a URL).

**Spotify Web Playback SDK (opt-in):** Include `"spotify"` in `services` to host a Connect device in bridge Chrome (see [ADR 0078](adrs/0078-spotify-web-playback-sdk-device.md)). The room creator must **re-link Spotify** once so the OAuth token includes the `streaming` scope. Without `"spotify"` in services, behavior stays on Spotify.app. SDK audio is ~256kbps AAC (fine for a transcoded stream).

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

**DJ Mac (packed):** start `local-remote` from the zip, open **http://127.0.0.1:9876/**, enable **Media Bridge**, save. Session / rooms / services are on that page (proxied). Child escape hatch: `http://127.0.0.1:18766/`.

**Dev from source — recommended:** local control UI + **Redis standby** (required for **Link to Media Bridge** from the web app — [ADR 0082](adrs/0082-media-bridge-link-via-redis-pubsub.md)):

```bash
npm run serve -w bridge-daemon
# open http://127.0.0.1:18766/  (or use consolidated UI via local-remote + features.bridge)
```

`serve` keeps a Redis connection and listens on `BRIDGE:CONTROL` even before a room is connected. From any admin browser (not only the DJ Mac), open the bridge room → Admin → **Link to Media Bridge**. That publishes a Redis link request; the standby daemon connects and ACKs.

If no daemon is in standby, the button shows: *No Media Bridge is online…* Start `serve` (or packed local-remote with bridge enabled) with Redis aimed at the same Redis as the API.

Pick a room marked **bridge** in the local UI (listed from Redis — no copy/paste), or use the web **Link** button. Edit services, Chrome/Tidal/Navidrome/mpv paths, Now Playing path, etc., then **Save**. Connect/disconnect from the Session / Rooms sections.

CLI alternatives:

```bash
npm run rooms -w bridge-daemon          # list rooms from Redis
npm run connect -w bridge-daemon -- --room YOUR_ROOM_ID
npm run connect -w bridge-daemon -- --room YOUR_ROOM_ID --ui   # connect + UI + standby
```

Note: plain `connect` **without** `--ui` does **not** listen for web Link requests.

Leave the process running. You should see connected drivers listed (and `[standby] listening on BRIDGE:CONTROL`).

First Chrome launch uses a dedicated profile under `~/.config/listening-room-bridge/chrome-profile`. Sign into **YouTube Premium** in that window (avoids ads on the broadcast).

## 6. Audio Hijack

- Capture: Chrome (bridge profile) for YouTube (+ Spotify when SDK device is enabled); **and mpv if using local**. Local library audio does **not** go through Chrome — the daemon plays Navidrome streams in **mpv**, so the room broadcast only includes it if AH (or Loopback feeding AH) captures the mpv process into the same mix as Chrome.
- Metadata: **Track Source** = the daemon’s Now Playing.txt (Other Source…). Turn off application metadata detection.
- **Title Format** in AH (e.g. `{title} | {artist} | {album}`) controls the stream string; the file itself must use `Title:` / `Artist:` / `Album:` lines
- Volume: per-driver via Volume Manager plugin (v1); optional AH Volume-block scripting is not required

**Quick check:** while a local track is playing, look at daemon logs for `[local] loadfile` / `[local] playing durationSec=…`. If that appears and Now Playing updates, mpv is playing — missing stream audio is almost always capture routing, not Navidrome.

## 7. Smoke test checklist

1. Open the room in the web app
2. Search for a track — results should show **source badges** (Spotify / YouTube / …)
3. Queue a **YouTube** result; press Play on the queue row
4. Confirm Chrome plays the video; Now Playing.txt updates; room Now Playing shows title + thumbnail
5. Queue a Spotify track:
   - **With SDK device** (`"spotify"` in services): quit Spotify.app; confirm audio plays in the bridge Chrome tab and Now Playing.txt updates. Daemon logs should show `[spotify-device] ready device_id=…`.
   - **Without SDK device**: confirm Spotify.app plays as before
6. (Optional) Queue a local Navidrome track; confirm mpv audio and artwork (data URI)
7. (Optional) **Browse / hybrid Search**: Add to Queue → **Browse** (Library index or Spotify search-entry) → album → track; or Search and click an Artist/Album row to deep-link into Browse ([ADR 0090](adrs/0090-hybrid-metadata-catalog-browse.md)).
8. Empty the queue and trigger a democracy skip / scratched-cd — active daemon source should **stop**
9. As room admin, use the **Now Playing scrubber** to seek within the track; with Volume Manager enabled, use its **broadcast volume** slider in Now Playing to change driver volume

## 7b. Thrift Store Local shelves (optional)

Restricted Local + inventory grants ([ADR 0098](adrs/0098-inventory-scoped-local-library-catalog-filters.md)):

1. In Navidrome, create curated playlists; keep them selective.
2. Room admin → Item Shops → enable → **Local library grants**: pick playlists from the dropdown (Media Bridge must be connected) or paste ids; set Library to **Admins + plugin grants only**.
3. Start a game session; give yourself a shelf grant (or buy from Thrift Store on a bridge room).
4. Add to Queue → Library should appear; Browse/Search should only show artists/albums/tracks on that playlist. Queuing a matching track consumes the grant. A full-library grant row unlocks the entire catalog.

Playlists are never shown as a browse mode in the client.

## 8. Export / publish

Post-show publish still creates Spotify/Tidal playlists from `metadataSources` IDs. YouTube/local-only tracks are skipped for those playlists (Markdown archive still lists them). Enrichment quality depends on clean title/artist from the queue item.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| YouTube search empty | `YOUTUBE_API_KEY` on API; quota; API enabled |
| `Bridge daemon not connected` | Daemon `connect` running; same `redisUrl` / room id; presence key TTL |
| No artwork for YouTube | Queue-item hydration; thumbnail URL CORS for dynamic theme |
| Local search empty | Navidrome creds; daemon includes `local`; RPC `search` |
| Browse tab missing / empty artists | Room has browseable sources effective for search; for Library: daemon CAPABILITIES include `local`, RPC `listArtists` / `listAlbums`; for Spotify: OAuth metadata source + search-entry query |
| Search has no Artist/Album rows | Query length ≥ 2; source implements browse; check `TRACK_SEARCH_RESULTS.artists` / `.albums` |
| Local track plays in UI / Now Playing but no stream audio | Audio Hijack is not capturing **mpv** (only Chrome). Add an Application source for `mpv`, or route mpv into the same Loopback device as Chrome. Confirm daemon log `[local] playing durationSec=…`. Spotify/YouTube can still work because they use Chrome. |
| Tidal won’t start | App path; CDP port 9223 free; login inside Tidal app |
| Double Now Playing | Turn off local-remote NP for this room |
| Stream metadata is ` \| \| ` | File must be `Title:`/`Artist:`/`Album:` lines (not `{title} \| {artist}`). Put the pipe format in AH Title Format. |
| YouTube “Video unavailable” hangs | Reconnect daemon (error/watchdog → ENDED → auto-advance). Some videos can’t embed; they’ll skip. |
| Spotify SDK `TOKEN_REQUEST` loops / auth failed | Restart API so bridge `onRoomCreated` wires token provisioning; re-link Spotify for `streaming` scope (refresh alone does not add scopes); Premium required; check API logs for `[bridge-spotify-token]` |
| Spotify SDK stuck on “Connecting…” / CORS on `track-playback` | Daemon relaunches bridge Chrome with site-isolation off + CDP preflight fix. Look for `[chrome] Launched … (bridge profile, SDK flags)` and `fulfilling track-playback CORS preflight`, then `ready device_id=`. |
| Spotify still needs Spotify.app | Remove `"spotify"` from daemon `services` to use legacy Connect, or verify `bridge:{room}:spotify_device` exists in Redis |

## Out of scope (this build)

- Phase 4 Electron `.dmg` / auto-update (deferred; localhost UI is ADR 0079)
- Audio Hijack Volume-block scripting (per-driver volume first)
- Scheduler segment tracks for YouTube/local
