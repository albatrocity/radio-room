# Local testing: Fake radio station (`dev-radio`)

Optional Compose service that replaces a real Shoutcast encoder for **local** radio-room development. It serves a looping MP3 with ICY metadata and can mirror Media Bridge now-playing over Redis ([ADR 0207](adrs/0207-local-dev-radio-station.md)).

This does **not** capture Media Bridge / Chrome / mpv audio. For real programme audio you still need Audio Hijack (or similar) — see [BRIDGE_LOCAL_TESTING.md](BRIDGE_LOCAL_TESTING.md).

## Quick start

```bash
# From repo root — start the stack + fake station
docker compose --profile dev-radio up

# Or only the station against an already-running Redis:
# docker compose --profile dev-radio up dev-radio
```

Health check:

```bash
curl -s http://127.0.0.1:8010/health | jq
```

Stream (browser / MSE):

```text
http://127.0.0.1:8010/stream
```

### Create-room prefill (opt-in)

Add to `.env` (see `.env.example`), then recreate the **web** container so Vite picks up the vars:

```bash
VITE_DEV_RADIO_META_URL=http://dev-radio:8010/stream
VITE_DEV_RADIO_LISTEN_URL=http://127.0.0.1:8010/stream
VITE_DEV_RADIO_PROTOCOL=raw
```

When unset, the lobby keeps the public rcast defaults.

### Manual room fields

| Field | Value |
|-------|--------|
| `type` | `radio` |
| `radioProtocol` | `raw` |
| `radioMetaUrl` | `http://dev-radio:8010/stream` (API in Docker) **or** `http://127.0.0.1:8010/stream` (API on host) |
| `radioListenUrl` | `http://127.0.0.1:8010/stream` (browser on host) |
| `playbackControllerId` | `spotify` or `bridge` |
| `fetchMeta` | `true` for Now Playing / track detection |

**Why two URLs?** The shoutcast adapter polls `mediaSourceConfig.url` (seeded from `radioMetaUrl` at create) **from the API process**. Inside Compose that is the `dev-radio` hostname. The browser cannot resolve `dev-radio`, so `radioListenUrl` uses the published host port.

Set URLs when creating the room. Admin edits update `radioMetaUrl` / `radioListenUrl` but may not rewire the closed-over poll job until API restart / job restore.

## Behaviour

1. **Fallback rotation** — Until a bridge (or manual) update arrives, titles rotate every `FALLBACK_ROTATE_MS` (default 30s): `Stub Signal | Dev Radio | Local Testing`, etc.
2. **Media Bridge mirror** — Subscribes to Redis `SYSTEM:NOW_PLAYING_CHANGED` (same channel `bridge-daemon` publishes). Formats ICY as `Title | Artist | Album`.
3. **Room filter** — Optional `DEV_RADIO_ROOM_ID` / `ROOM_ID` env: only accept events for that room. Default: latest event (one standby daemon).
4. **Manual override** — `POST /now-playing` with JSON `{ "title", "artist?", "album?" }` for scripted tests.
5. **CORS** — `Access-Control-Allow-Origin: *` so MSE / oscilloscope paths work locally.

## Media Bridge connectivity checklist

Bridge **link and control** are independent of the fake station (Redis + host daemon). Use both for a radio + bridge room without Audio Hijack metadata:

1. `docker compose --profile dev-radio up` (API, Redis, web, `dev-radio`)
2. Set `YOUTUBE_API_KEY` on the API if you need YouTube search
3. Prefill or enter the URL pair above; create a **radio** room with `playbackControllerId: bridge`
4. On the Mac: `npm run serve -w bridge-daemon` with `redisUrl: "redis://127.0.0.1:6379"` ([BRIDGE_LOCAL_TESTING.md](BRIDGE_LOCAL_TESTING.md) §3–5)
5. Admin → **Link to Media Bridge**
6. Play a track from the queue — daemon writes Now Playing + publishes Redis; within a few seconds `dev-radio` ICY title should match; API shoutcast poll (~3s) updates room Now Playing

**Expected split:**

| Concern | Source |
|---------|--------|
| Bridge online / RPC / search | Redis presence + `bridge-daemon` |
| Room Now Playing / `TRACK_CHANGED` | Shoutcast poll of `dev-radio` ICY (mirrored from bridge when linked) |
| What listeners hear | Synthetic MP3 from `dev-radio` |
| Real DJ Mac audio | Still Audio Hijack (or other host capture) into a real encoder |

## Host-only (no Compose for the station)

```bash
REDIS_URL=redis://127.0.0.1:6379 npm run start -w dev-radio-station
# stream: http://127.0.0.1:8010/stream
# use the same URL for both meta and listen when the API also runs on the host
```

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Room stuck offline / no title | `curl` health; `radioProtocol` is `raw`; meta URL reachable **from API** (`docker compose exec api wget -qO- http://dev-radio:8010/health`) |
| Browser cannot play | Listen URL is `127.0.0.1:8010`, not `dev-radio`; port `8010` published |
| Bridge titles never appear | Daemon publishing? Same Redis? Optional `ROOM_ID` too strict? |
| MSE / oscilloscope fails | Station sends CORS `*`; confirm `VITE_RADIO_MSE` not forced off |
| Still hear silence / tone only | Expected without AH — synthetic fixture audio |

## Out of scope

- Replacing MediaMTX / `live` RTMP rooms
- Faithful Shoutcast v2 `/statistics` or Icecast admin (use `raw` for the fake station)
- Capturing or re-encoding host bridge audio inside Docker
