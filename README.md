# Listening Room

A web app to create chat rooms around Shoutcast servers, or use as a remote control for a Spotify or Tidal account.

## Quick Start

```bash
# Install dependencies
npm install

# Start with Docker (recommended)
docker compose up
```

**Services:**
- Web: http://localhost:8000
- API: http://localhost:3000
- Redis: localhost:6379

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
│   ├── adapter-*/    # Media source adapters (Spotify, Tidal, Shoutcast)
│   ├── plugin-*/     # Room plugins
│   └── ...
│
└── docs/             # Documentation
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
