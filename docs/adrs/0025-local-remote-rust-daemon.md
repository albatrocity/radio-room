# 0025. local-remote: Rust daemon + local control UI

**Date:** 2026-03-31  
**Status:** Accepted

## Context

Operators need a **local** process that connects to the **remote** Redis used by Listening Room, subscribes to **`SYSTEM:*`** domain events, and runs small integrations (e.g. **OSC** to external apps such as Farrago) without coupling to Socket.IO or the web apps. The tool should be **low footprint**, easy to run in the **background**, and offer a **simple runtime configuration** surface.

## Decision

Add **`apps/local-remote`**: a **Rust** binary that:

1. Subscribes to Redis **`PSUBSCRIBE SYSTEM:*`**, parses JSON payloads per [`packages/types/SystemEventTypes.ts`](../../packages/types/SystemEventTypes.ts).
2. Filters events (e.g. by `roomId`) and dispatches enabled **features** (v1: **OSC over UDP** on `SEGMENT_ACTIVATED` using a configurable **`segmentId` → OSC address** map, e.g. to trigger Farrago tile endpoints).
3. Exposes a **local HTTP** control plane on `127.0.0.1:9876` by default: static UI + JSON API for live config updates; config is persisted under the platform config directory (`local-remote/config.json`).
4. Sends OSC from the async runtime via **UDP** (no separate I/O thread required for v1).

## Alternatives considered

- **Node.js daemon** — fastest alignment with the rest of the monorepo, but higher baseline memory and requires a Node runtime on the host.
- **Electron / Tauri desktop shell** — stronger “single app” packaging, but heavier than needed for a background subscriber + localhost UI.
- **Rust-only (no UI)** — smallest binary, but worse ergonomics for runtime toggles and mapping edits.

## Consequences

- **Positive:** Small native binary, no Node runtime, true background operation, localhost UI/API for safe operator-only access.
- **Positive:** Consumes the same **`SYSTEM:*`** contract as plugins and cross-server fan-out ([ADR 0008](0008-system-events-and-broadcaster-pattern.md), [ADR 0021](0021-room-attached-show-and-segment-activation.md)).
- **Negative:** Introduces **Rust** toolchain expectations for contributors working on this app; CI should run `cargo test`/`clippy` for `apps/local-remote` when the app changes.
- **Negative:** OSC delivery and Redis pub/sub are **best-effort**; reconnect and operator-visible status are required (see app README).
