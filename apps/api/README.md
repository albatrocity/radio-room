# Listening Room API

Express + Socket.IO entry point. Room logic lives in `@repo/server`. Adapters and plugins are registered in `src/server.ts`.

## Development

From the repo root:

```bash
cp .env.example .env
docker compose up
```

The API listens on port **3000**. Compose sets `DATABASE_URL` to the bundled Postgres and `REDIS_URL` to the bundled Redis. Spotify, Tidal, Google, and YouTube credentials come from `.env`. See [DOCKER_SETUP.md](../../DOCKER_SETUP.md).

Registered media sources: `spotify`, `shoutcast`, `rtmp`. Metadata sources: `spotify`, `tidal`, `youtube`, `local`. Playback controllers: `spotify`, `bridge`.
