# Listening Room

A web app for shared listening rooms: Spotify jukeboxes, Shoutcast/Icecast radio, and live RTMP ingest, with chat, a queue, and room plugins.

## Quick Start

```bash
# Install dependencies
npm install

# Start with Docker (recommended)
docker compose up
```

**Services:** Open the web and scheduler apps at **http://127.0.0.1** (not `localhost`) so URLs match Spotify OAuth redirect URIs and session cookies stay same-site across the API and frontends.

- Web: http://127.0.0.1:8000
- Scheduler: http://127.0.0.1:8001
- API: http://127.0.0.1:3000
- Redis: localhost:6379
- PostgreSQL: localhost:5432

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Key variables:

- `DATABASE_URL` -- PostgreSQL connection string (required for admin auth)
- `BETTER_AUTH_SECRET` -- Secret for session encryption (min 32 chars)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` -- Google OAuth credentials (optional)
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` -- Spotify OAuth credentials (for Spotify rooms)
- `TIDAL_CLIENT_ID` / `TIDAL_CLIENT_SECRET` -- Tidal OAuth credentials (for Tidal rooms)

### Seed Admin User

After starting services, create the first admin account:

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=your-password npx tsx packages/db/src/seed.ts
```

See [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed setup instructions including Spotify/Tidal OAuth configuration.

---

## Project Structure

This is a Turborepo monorepo:

```
listening-room/
├── apps/
│   ├── api/              # Express + Socket.IO server
│   ├── web/              # React client (Vite, XState v5, Chakra UI v3)
│   ├── scheduler/        # Show scheduling admin (Vite + React)
│   ├── game-studio/      # Browser sandbox for items and shops
│   ├── studio-bridge/    # Local stub API so Game Studio can drive the web Room UI
│   ├── load-tester/      # Load testing CLI (`docker compose --profile testing`)
│   ├── local-remote/     # Rust daemon: Redis SYSTEM:*, Now Playing, OSC, DJ Mac supervisor
│   └── bridge-daemon/    # Node Media Bridge (Chrome/mpv, Redis RPC); supervised on the DJ Mac
│
├── packages/
│   ├── server/           # Handlers, operations, services
│   ├── types/            # Shared TypeScript types
│   ├── auth/             # Better-Auth instance, middleware, React client
│   ├── db/               # Drizzle schema, migrations, database client
│   ├── email/            # Newsletter send (Amazon SES)
│   ├── game-logic/       # Shared game/inventory rules used by server and Game Studio
│   ├── adapter-spotify/  # Spotify media source, metadata source, playback controller
│   ├── adapter-tidal/    # Tidal metadata source
│   ├── adapter-shoutcast/# Shoutcast/Icecast media source
│   ├── adapter-rtmp/     # Live RTMP media source (MediaMTX)
│   ├── adapter-bridge/   # Bridge playback controller; YouTube and local metadata
│   ├── plugin-*/         # Room plugins registered in apps/api/src/server.ts
│   ├── plugin-base/      # BasePlugin
│   ├── plugin-config-ui/ # Shared schema-driven config forms (web + scheduler)
│   └── …                 # factories, utils, eslint-config, typescript-config, spotify-catalog
│
├── infra/                # MediaMTX, asset CDN, SES
└── docs/                 # Guides and architectural decision records
```

---

## Game Devs

**Game Studio** is a self-contained Vite app for testing items, shops, and game rules in the browser—**no Docker or API** required. All current item and shop content used in the studio lives in **`packages/plugin-item-shops/`**; edit there and run the studio to see changes with hot reload.

- **Full setup and platform notes (macOS / Windows):** [apps/game-studio/README.md](apps/game-studio/README.md)

From the **repository root**, start the dev server (http://localhost:8005):

```bash
make game-studio
```

**Windows:** If `make` is not available, use:

```bash
npm run dev -w game-studio
```

---

## Documentation

- **[AGENTS.md](AGENTS.md)** - AI agent guidelines and codebase patterns
- **[Backend Development](docs/BACKEND_DEVELOPMENT.md)** - Server architecture, SystemEvents, Broadcasters
- **[Plugin Development](docs/PLUGIN_DEVELOPMENT.md)** - Creating room plugins
- **[Web Client](apps/web/README.md)** - Frontend architecture, XState patterns

---

## Architecture

### Now playing data flow

Media sources report what is audible. They call `submitMediaData` (`packages/server/lib/createJobApi.ts`), which runs `handleRoomNowPlayingData`. Metadata sources enrich that report. Playback controllers start the next queued track; they do not replace the media source.

```
Media sources (each calls submitMediaData)
  spotify      jukebox    Web API track; often includes enrichedTrack
  shoutcast    radio      ICY title/artist plus stationMeta
  rtmp         live       ingest metadata
                          dropped on hybrid radio (Shoutcast stays authoritative)
        |
        v
handleRoomNowPlayingData
  1. Same-track check (early exit)
  2. Streaming mode (fetchMeta off): status only, no track row
  3. resolveTrackData()
       use enrichedTrack when the submission already has one
       else search metadata sources when fetchMeta and metadataSourceIds
       are set (spotify, tidal, youtube, local)
       else build a raw track from the submission
  4. Match the app-controlled queue or the already-dispatched row
  5. Persist RoomMeta, emit TRACK_CHANGED, append the playlist

Playback controllers (start the next track; they are not media sources)
  spotify    Web API / Connect devices
  bridge     DJ Mac: Spotify in Chrome, YouTube, local files via mpv
```

### Key concepts

- **Media source**: Reports what is currently audible (`spotify`, `shoutcast`, `rtmp`).
- **Metadata source**: Catalog search and enrichment (`spotify`, `tidal`, `youtube`, `local`). A room may enable several via `metadataSourceIds`.
- **Playback controller**: Starts, seeks, and sets volume for the queue (`spotify` or `bridge`).
- **MediaSourceSubmission**: The DTO every media source submits.
- **enrichedTrack**: Optional catalog row already attached by the media source (typical for Spotify).
- **Room types**: `jukebox` (Spotify media source), `radio` (Shoutcast, optional experimental WebRTC beside it), `live` (RTMP ingest through MediaMTX). Bridge is a playback controller on a radio room, not a fourth room type.

---

## Development

```bash
# Install dependencies
npm install

# Start all services
docker compose up

# Or run dev servers directly
npm run dev

# Run tests
npm test

# Build all packages
npm run build
```

### MediaMTX (Live Rooms)

Live rooms use [MediaMTX](https://github.com/bluenviron/mediamtx) to accept RTMP ingest and serve WebRTC/LL-HLS output. Start it alongside the other services with the `live` profile:

```bash
docker compose --profile live up
```

Once running:

| Endpoint      | URL                                            | Purpose                                     |
| ------------- | ---------------------------------------------- | ------------------------------------------- |
| RTMP ingest   | `rtmp://localhost:1935/{streamKey}`            | Point OBS, Audio Hijack, or FFmpeg here     |
| WebRTC (WHEP) | `http://localhost:8889/{streamKey}/whep`       | Sub-second playback (primary)               |
| LL-HLS        | `http://localhost:8888/{streamKey}/index.m3u8` | 2-6s latency fallback (plays in Safari/VLC) |

The `{streamKey}` is any path you choose (e.g., `live`). Whatever you use for ingest is what you use for playback.

**Test with FFmpeg** (sends a 440Hz test tone):

```bash
ffmpeg -re -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=60" \
  -c:a aac -b:a 320k \
  -f flv rtmp://localhost:1935/live
```

**Stream from another machine on your LAN:** replace `localhost` with the host machine's IP (`ipconfig getifaddr en0` on macOS). Configuration lives in [`infra/mediamtx/mediamtx.yml`](infra/mediamtx/mediamtx.yml). For **local WebRTC ICE**, add that LAN IP under `webrtcAdditionalHosts` (the committed default is `[]`; compose still mounts this file for editing).

**Production (e.g. DigitalOcean):** see [`infra/mediamtx/README.md`](infra/mediamtx/README.md) for firewall ports, `/opt/mediamtx/mediamtx.yml`, GitHub Actions deploy, and HTTPS/WebRTC notes.
