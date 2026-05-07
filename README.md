# Listening Room

A web app to create chat rooms around Shoutcast servers, or use as a remote control for a Spotify or Tidal account.

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
│   ├── api/          # Express + Socket.IO server
│   ├── web/          # React frontend (Vite, XState, Chakra UI)
│   └── load-tester/  # Load testing CLI
│
├── packages/
│   ├── server/       # Core server logic
│   ├── types/        # Shared TypeScript types
│   ├── auth/         # Better-Auth instance, middleware, React client
│   ├── db/           # Drizzle ORM schema, migrations, database client
│   ├── adapter-*/    # Media source adapters (Spotify, Tidal, Shoutcast)
│   ├── plugin-*/     # Room plugins
│   └── ...
│
└── docs/             # Documentation
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

### MediaSource → Server Data Flow

MediaSources submit raw media data via a standard DTO. The server handles enrichment, deduplication, and event emission.

```
┌─────────────────────────────────────────────────────────────────┐
│                     MediaSource Adapters                         │
│                                                                  │
│  ┌─────────────────────┐     ┌───────────────────────────────┐  │
│  │ Spotify             │     │ Shoutcast                     │  │
│  │ - trackId           │     │ - trackId (hashed title)      │  │
│  │ - title, artist     │     │ - title, artist, album        │  │
│  │ - enrichedTrack ✓   │     │ - stationMeta                 │  │
│  │ - metadataSource ✓  │     │ (no enrichment - just raw)    │  │
│  └──────────┬──────────┘     └───────────────┬───────────────┘  │
└─────────────┼────────────────────────────────┼──────────────────┘
              │   MediaSourceSubmission        │
              v                                v
┌─────────────────────────────────────────────────────────────────┐
│              handleRoomNowPlayingData (Server)                   │
│                                                                  │
│  1. Check if same track (early exit)                            │
│  2. resolveTrackData():                                         │
│     - If enrichedTrack provided → use it (skip enrichment)      │
│     - Else if room.fetchMeta && room.metadataSourceId →         │
│       → call MetadataSource.search() to enrich                  │
│     - Else → use raw data (createRawTrack)                      │
│  3. Construct QueueItem                                         │
│  4. Persist to Redis, emit events                               │
└─────────────────────────────────────────────────────────────────┘
```

### Key Concepts

- **MediaSource**: Fetches raw media data (what's currently playing)
- **MetadataSource**: Enriches tracks with album art, artist info, etc.
- **MediaSourceSubmission**: Standard DTO submitted by all MediaSources
- **enrichedTrack**: Optional pre-enriched data (when MediaSource = MetadataSource, e.g., Spotify)

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
