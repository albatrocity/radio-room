# 0077. Bridge Daemon Local Control UI (Room Discovery + Config)

**Date:** 2026-07-20  
**Status:** Accepted

## Context

Operators previously had to copy room ids into `bridge-daemon connect --room …` and edit `~/.config/listening-room-bridge/config.json` by hand. The design plan’s Phase 4 Electron menu-bar shell ([0075](0075-bridge-composite-playback-controller.md) §8 packaging) remains deferred. Meanwhile we need the same operator ergonomics that [0025](0025-local-remote-rust-daemon.md) provides for `local-remote`: a localhost control plane for config and session control.

## Decision

1. **Local HTTP control UI** — `apps/bridge-daemon` serves a single-page UI (default `http://127.0.0.1:18766/`) via `bridge-daemon serve` (or `connect --ui`). JSON API: `GET/PUT /api/config`, `GET /api/status`, `GET /api/rooms`, `POST /api/connect`, `POST /api/disconnect`.
2. **Full config surface** — The UI edits all fields in the daemon Zod schema (`redisUrl`, `httpListen`, `defaultRoomId`, `services`, `chrome`, `tidal`, `navidrome`, `mpv`, `nowPlayingPath`), persisted to the existing config path.
3. **Room discovery via Redis** — `GET /api/rooms` (and CLI `bridge-daemon rooms`) reads the platform `rooms` set and `room:{id}:details` hashes over the configured `redisUrl`. Bridge rooms (`playbackControllerId === "bridge"`) are sorted first and badged. No new public HTTP API on the Listening Room API is required (contrast [0029](0029-public-scheduling-read-for-local-remote.md) for scheduling).
4. **Electron packaging** — Remains deferred; this UI is the Phase 1–3 operator surface and a precursor to any future supervisor shell.

## Consequences

### Positive

- No copy/paste of room ids when Redis is reachable.
- Config changes without hand-editing JSON.
- Same Redis credentials the daemon already needs for RPC.

### Negative / trade-offs

- Room list only includes rooms present in the connected Redis (correct for local Docker; operators must point `redisUrl` at production Redis to see prod rooms).
- Changing `httpListen` requires restarting `serve` to rebind.
- Bind is localhost-only by default; do not expose the control UI on a public interface.
