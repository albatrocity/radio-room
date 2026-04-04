# 0027. local-remote UI: CORS for scheduling API reads

**Date:** 2026-04-03  
**Status:** Accepted

## Context

The local-remote control UI ([ADR 0025](0025-local-remote-rust-daemon.md)) runs on a **different browser origin** than the platform API (default `http://127.0.0.1:9876` vs API on another host/port). The embedded UI performs **cross-origin `fetch`** to load scheduling data. Without an explicit CORS **origin** allowlist entry, browsers block those responses.

## Decision

1. Add **`http://127.0.0.1:9876`** and **`http://localhost:9876`** to the platform API **CORS** `origin` allowlist with **`credentials: true`** (so credentialed calls remain possible for other tooling; segment picking uses public GETs without credentials per [ADR 0029](0029-public-scheduling-read-for-local-remote.md)).
2. Support an optional comma-separated **`LOCAL_REMOTE_URL`** environment variable for extra origins when operators bind the local-remote HTTP server to a non-default host or port.

## Consequences

- **Positive:** local-remote can call the API from the browser across origins (segment picker and any future cross-origin UI needs).
- **Positive:** Custom binds remain configurable without code changes via **`LOCAL_REMOTE_URL`**.
- **Negative:** Each additional allowed origin expands cross-origin access; restrict to localhost-style tooling origins and env-driven deployment values.

## Update (2026-04-04)

Segment picking uses **unauthenticated** **`GET /api/public/scheduling/*`** ([ADR 0029](0029-public-scheduling-read-for-local-remote.md)); CORS for local-remote’s origin remains required for those GETs (no **`credentials: "include"`** needed for the picker).
