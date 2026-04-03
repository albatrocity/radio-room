# 0027. local-remote UI: CORS for scheduling API reads

**Date:** 2026-04-03  
**Status:** Accepted

## Context

The local-remote control UI ([ADR 0025](0025-local-remote-rust-daemon.md)) runs on a **different browser origin** than the platform API (default `http://127.0.0.1:9876` vs API on another port). Operators need to **list ready shows** and **load show segments** from the scheduling REST API using the same **Better Auth** session as the scheduler app (`credentials: "include"`). Without an explicit CORS allowlist entry, browsers block credentialed cross-origin requests.

## Decision

1. Add **`http://127.0.0.1:9876`** and **`http://localhost:9876`** to the platform API **CORS** `origin` allowlist with **`credentials: true`** (unchanged).
2. Support an optional comma-separated **`LOCAL_REMOTE_URL`** environment variable for extra origins when operators bind the local-remote HTTP server to a non-default host or port.

The scheduling endpoints and **platform admin** authorization model are unchanged; this ADR only documents **browser cross-origin access** for the local-remote embedded UI.

## Consequences

- **Positive:** Operators can use **Fetch ready shows** / segment picking in local-remote without a separate token flow, as long as they are signed in as a platform admin in the same browser profile.
- **Positive:** Custom binds remain configurable without code changes via **`LOCAL_REMOTE_URL`**.
- **Negative:** Each additional allowed origin slightly expands the surface for credentialed cross-origin calls; restrict to localhost-style tooling origins and env-driven deployment values.
