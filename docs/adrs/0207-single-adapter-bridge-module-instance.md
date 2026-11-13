# 0207. One `@repo/adapter-bridge` module instance in the API

**Date:** 2026-11-13
**Status:** Accepted

## Context

`@repo/adapter-bridge` is an ESM package (`"type": "module"`). `@repo/server` and `apps/api` are CommonJS and run under `tsx`. In that setup a static `import` compiles to `require()` and a dynamic `import()` goes through the ESM loader. The two calls return **different module instances** of the same package, each with its own module-level state.

The package keeps process state at module level. Examples are the `/device` socket registry and link wait in `lib/deviceSession.ts`, per-room capability caches, and per-room RPC clients. `apps/api`, `deviceNamespace`, `deviceBridgeState`, and `DeviceSegmentBroadcaster` imported the package statically. Most of `@repo/server` loaded it with `await import()`, originally to sidestep the `adapter-bridge` ↔ `server` cycle. After the device socket ([ADR 0204](0204-device-trust-boundary.md)), daemons registered in the static instance. Link requests, room bridge wiring (`registerBridgeForRoom`), capability reads, TTS, and local catalog calls ran in the dynamic instance and saw no daemon. One symptom was "No Media Bridge is online" while the daemon was connected.

## Decision

1. `@repo/server` imports `@repo/adapter-bridge` with static `import` only. Do not use `await import("@repo/adapter-bridge")` in server or API code.
2. The `adapter-bridge` ↔ `server` cycle stays. Both packages only touch each other's exports inside functions, not at module evaluation, so a static cycle is safe under CommonJS.
3. Tests keep using `vi.mock("@repo/adapter-bridge")`, which works the same with static imports.

## Consequences

- One socket registry, one set of capability caches, and one set of RPC clients per process. Link, bridge playback wiring, TTS, and catalog calls see the connected daemon.
- `@repo/adapter-bridge` loads at API startup instead of lazily. The cost is negligible.
- The same hazard applies to any ESM workspace package that has module state and is loaded both ways from CommonJS. Pick one import style per package.
