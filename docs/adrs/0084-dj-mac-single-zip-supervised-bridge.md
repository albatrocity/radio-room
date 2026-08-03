# 0084. DJ Mac single-zip distribution with supervised Media Bridge

**Date:** 2026-07-24
**Status:** Accepted

## Context

The DJ Mac must run **local-remote** (OSC / Farrago / Redis) and **bridge-daemon** (Chrome CDP / Spotify SDK / Navidrome+mpv) without installing Xcode, Rust, or a full Node monorepo toolchain. Shipping two separate AirDrop workflows (Rust binary + “bring the repo / `npm run serve`”) doubles operational burden and update friction.

A true single-process rewrite of CDP drivers into Rust is out of scope. Electron / notarized installers are also deferred.

## Decision

1. **One ship unit** — From the build Mac, `npm run pack:dj-mac` (`scripts/pack-dj-mac.sh`) produces `dist/listening-room-dj-mac-darwin-x64.zip` containing:
   - `local-remote` (x86_64-apple-darwin) — sole Audio Hijack start/stop entrypoint
   - `runtime/node` — pinned Node darwin-x64 (no system Node)
   - `bridge-daemon/daemon.cjs` — esbuild CJS bundle (`puppeteer-core` external + `node_modules`)
   - `bridge-daemon/static/` (+ optional `ui/` escape hatch)
   - `README.txt` (quarantine / AH notes)

2. **Two processes, one operator entrypoint** — local-remote supervises the Node child (`features.bridge`), injects `BRIDGE_REDIS_URL` / `BRIDGE_DEFAULT_ROOM_ID` / `BRIDGE_PACKAGE_ROOT`, health-checks, restarts, and reverse-proxies `/api/bridge/*` → child `:18766`.

3. **Single bookmark** — Operators use `http://127.0.0.1:9876/` for OSC, soundboard (`/soundboard`), and Media Bridge session/rooms/services/paths. Child UI on `:18766` is an escape hatch only.

4. **Configs outside the zip** — Survive replace-in-place updates:
   - `~/Library/Application Support/local-remote/config.json`
   - `~/.config/listening-room-bridge/config.json`

5. **Now Playing ownership** — When `features.bridge.enabled` is true, local-remote auto-disables its macOS Now Playing watcher so the bridge owns `Now Playing.txt`.

## Consequences

- DJ Mac never needs Rust/npm/tsx; updates are “replace folder + restart AH”.
- Pack layout paths (`runtime/node`, `bridge-daemon/daemon.cjs`) are relative to the `local-remote` executable.
- Chrome, Spotify, TIDAL, Navidrome, mpv, and Audio Hijack remain external installs.
- Optional later: CI upload of the same zip (same artifact, different transport).

## See also

- [0025](0025-local-remote-rust-daemon.md)
- [0079](0079-bridge-daemon-local-control-ui.md) (child `:18766` UI; escape hatch / dev)
- [0082](0082-media-bridge-link-via-redis-pubsub.md)
- [docs/BRIDGE_LOCAL_TESTING.md](../BRIDGE_LOCAL_TESTING.md)
- `scripts/pack-dj-mac.sh`, `apps/bridge-daemon/scripts/bundle.mjs`
