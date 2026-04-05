# 0030. local-remote: Farrago soundboard (bidirectional OSC)

**Date:** 2026-04-05  
**Status:** Accepted

## Context

Operators who already use local-remote to send OSC to [Farrago](https://rogueamoeba.com/support/manuals/farrago/?page=osc) on `SEGMENT_ACTIVATED` also want a **browser soundboard**: browse Farrago **sets**, see **tiles** (title, color), and **trigger** playback without editing segment maps. Farrago can expose tile state over OSC when a controller sends `/ping`, but responses are delivered to Farrago’s configured **OSC Output** address—not to the ephemeral UDP source port used for sends ([ADR 0025](0025-local-remote-rust-daemon.md)).

## Decision

Extend **`apps/local-remote`** with an optional **soundboard** feature:

1. **Config** — `features.soundboard.enabled` and `features.soundboard.oscListenPort`. When enabled, **`features.osc` must also be enabled**; existing `osc.host` / `osc.port` continue to target Farrago **OSC Input** for outbound commands (`/ping`, `/set/.../play`).
2. **UDP listener** — Bind `0.0.0.0:oscListenPort` and decode incoming OSC with **`rosc`**, updating an in-memory **Farrago board** model from addresses like `/set/{n}/tile/{x}/{y}/{title|color|play|…}` and `/set/selected/tile/...`.
3. **HTTP** — Serve **`GET /soundboard`** (embedded static HTML) and **`GET /api/soundboard/state`** (JSON snapshot). **`POST /api/soundboard/ping`** sends `/ping` to Farrago Input; tile updates arrive asynchronously on the listener. **`POST /api/soundboard/play`** / **`stop`** send float args to `/set/.../play` (numeric set or `useSelectedSet` for `/set/selected/...`).
4. **UI** — Single-page HTML (no separate frontend build), consistent with the existing config UI pattern.

Operators must set Farrago **OSC Output** to `127.0.0.1:{oscListenPort}` (or the machine running local-remote).

## Alternatives considered

- **Poll-only / no listener** — Cannot retrieve tile titles/colors; Farrago does not reply on the send socket.
- **Platform API integration** — No Farrago data in Listening Room; OSC remains the only supported contract.

## Consequences

- **Positive:** Local-only control surface for Farrago tiles; reuses existing OSC send path and config file.
- **Positive:** Soundboard state stays in-process; no Redis or platform coupling.
- **Negative:** Requires correct Farrago Output configuration and a **free UDP port** distinct from Farrago Input.
- **Negative:** Tile **icons** are not part of Farrago’s documented OSC surface; the UI uses a generic audio icon and maps **color indices** heuristically to CSS (may need tuning against real Farrago builds).
