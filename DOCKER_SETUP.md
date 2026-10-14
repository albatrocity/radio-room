# Docker Setup Guide

## Prerequisites

- Docker Desktop installed and running
- Docker Compose v2+ (`docker compose`, not the `docker-compose` binary)
- A `.env` in the repo root (`cp .env.example .env`)

Postgres and Redis come up with the compose stack. Admin login uses Better-Auth against that Postgres database. Spotify and Tidal OAuth are optional and only needed for those sources.

## Initial Setup

### 1. Environment

```bash
cp .env.example .env
```

Values the API container reads from `.env` (compose also supplies `DATABASE_URL` for the bundled Postgres):

- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — Spotify Web API and playback
- `SPOTIFY_REDIRECT_URI` — default `http://127.0.0.1:3000/auth/spotify/callback`
- `TIDAL_CLIENT_ID` / `TIDAL_CLIENT_SECRET` — Tidal metadata
- `BETTER_AUTH_SECRET` — session encryption (at least 32 characters)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional admin Google login
- `APP_URL` — default `http://127.0.0.1:8000`
- `YOUTUBE_API_KEY` — YouTube metadata through the Media Bridge

Spotify redirect URI in the [developer dashboard](https://developer.spotify.com/dashboard/applications) must be the loopback literal `http://127.0.0.1:3000/auth/spotify/callback`. Open the web and scheduler apps at **http://127.0.0.1** (not `localhost`) so cookies stay same-site with that redirect.

### 2. Start services

```bash
docker compose up --build
```

Detached: `docker compose up -d --build`.

| Service | URL / port | Notes |
| --- | --- | --- |
| Web | http://127.0.0.1:8000 | Vite dev server |
| Scheduler | http://127.0.0.1:8001 | Vite dev server |
| API | http://127.0.0.1:3000 | Express + Socket.IO (`tsx watch`) |
| Redis | localhost:6379 | Room state, sessions, pub/sub |
| Postgres | localhost:5432 | User `listening_room`, database `listening_room` |

Live ingest is a separate profile: `docker compose --profile live up` (MediaMTX). The load tester is `docker compose --profile testing up load-tester`.

After Postgres is up, create the first admin from the repo root. The host `.env` `DATABASE_URL` uses `localhost:5432`, which is the published Postgres port:

```bash
SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=your-password npx tsx packages/db/src/seed.ts
```

## Development workflow

### Hot reload

- **API**: `apps/api/src` and `packages/` are bind-mounted; `tsx watch` restarts on change.
- **Web and scheduler**: the app directory and `packages/` are bind-mounted. Vite polls for changes when `VITE_DOCKER=1`.

### Logs and lifecycle

```bash
docker compose logs -f
docker compose logs -f api
docker compose logs -f web

docker compose restart api
docker compose down
docker compose down -v   # also drops Redis and Postgres volumes
```

## Testing the setup

### API health

```bash
curl http://127.0.0.1:3000/me
```

Expect `{"error":"Unauthorized"}` when no session cookie is sent.

### Spotify auth

1. Open http://127.0.0.1:3000/auth/spotify/login
2. Sign in with Spotify
3. The browser returns to the web app

### Redis

```bash
docker compose exec redis redis-cli ping
```

Expect `PONG`.

## Troubleshooting

### API will not start

```bash
docker compose logs api
```

Typical causes: Postgres is not healthy yet, `DATABASE_URL` does not match the compose Postgres, or a required env var is empty.

### Web will not start

```bash
docker compose logs web
```

Port 8000 already in use, or the Vite bind mount cannot see `packages/`.

### Stale containers

```bash
docker compose down -v
docker compose up --build
```

`down -v` deletes Redis and Postgres data, including seeded admins.

### node_modules conflicts

Host `node_modules` should not be copied into the image over the container install. If installs disagree:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
docker compose up --build
```

## Production images

```bash
docker build -f apps/api/Dockerfile -t listening-room-api .
docker build -f apps/web/Dockerfile --target runner -t listening-room-web .
```

Production deploys set `REDIS_URL`, `DATABASE_URL`, Spotify/Tidal credentials, and `BETTER_AUTH_SECRET` in the host environment. The compose file is the local development stack.

## Architecture

```
Web (Vite :8000)          Scheduler (Vite :8001)
        \                      /
         \                    /
          v                  v
     API (Express + Socket.IO :3000)
       |            |
       v            v
    Redis :6379   Postgres :5432
```

Media sources registered on the API: Spotify, Shoutcast, RTMP. Metadata sources: Spotify, Tidal, YouTube, local. Playback controllers: Spotify and Media Bridge (the bridge daemon is not a compose service; it runs on the DJ Mac).

## Volume mounts

**API**

- `./apps/api/src` → `/app/apps/api/src`
- `./apps/api/tsconfig.json` → `/app/apps/api/tsconfig.json`
- `./packages` → `/app/packages`

**Web and scheduler**

- `./apps/web` or `./apps/scheduler` → the matching `/app/apps/...` directory (the whole app, so TanStack Router's temp files stay on one filesystem)
- `./packages` → `/app/packages`

## Next steps

1. Seed an admin, then open http://127.0.0.1:8000
2. Optional: Spotify login at http://127.0.0.1:3000/auth/spotify/login
3. Scheduler: http://127.0.0.1:8001
4. Live rooms: `docker compose --profile live up` and [infra/mediamtx/README.md](infra/mediamtx/README.md)
