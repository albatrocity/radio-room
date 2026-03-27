# 0005. Adapter Pattern for Media Services

**Date:** 2025-01-01
**Status:** Accepted

## Context

The Listening Room needs to support multiple third-party music services (Spotify, Tidal, Shoutcast, and potentially others) for playback control, track metadata lookup, and media streaming. Each service has different APIs, authentication flows, and capabilities. Hard-coding service-specific logic into the server would create tight coupling and make adding new services prohibitively expensive.

## Decision

Use an **adapter pattern** with three distinct adapter interfaces, plus an authentication adapter:

- **`PlaybackControllerAdapter`**: Controls playback on the user's device (play, pause, skip). Used by jukebox-style rooms.
- **`MetadataSourceAdapter`**: Searches for tracks and retrieves metadata (title, artist, album art). Powers search and library features.
- **`MediaSourceAdapter`**: Provides audio streams for server-mediated playback. Used by radio-style rooms (e.g., Shoutcast).
- **`ServiceAuthenticationAdapter`**: Handles OAuth flows for each service.

Key design choices:

- **Registration at composition root**: Adapters are registered in `apps/api/src/server.ts`. The `@repo/server` package contains no hard-coded adapter references; it depends only on adapter interfaces defined in `@repo/types`.
- **`AdapterRegistry`**: Maps in `AppContext.adapters` store both instances and modules (for lifecycle hooks). Instance maps: `playbackControllers`, `metadataSources`, `mediaSources`, `serviceAuth`. Module maps provide `onRoomCreated`/`onRoomDeleted` hooks.
- **Per-room adapter instances**: Adapters may be instantiated per room with room-specific configuration (e.g., the room creator's OAuth tokens).
- **Lifecycle hooks**: `onRoomCreated` allows adapters to register recurring jobs (e.g., Spotify jukebox polling); `onRoomDeleted` cleans up those jobs.
- **Job registration**: Adapters receive a `registerJob` callback during registration to schedule recurring work via `JobService`.
- **Job restoration**: On server restart, `restoreAdapterJobs` iterates existing Redis rooms and re-invokes `onRoomCreated` to restore polling jobs.

## Consequences

- **Open for extension**: Adding a new music service means implementing the appropriate adapter interface(s) and registering in the API entry point. No server changes needed.
- **Separation of concerns**: Transport, business logic, and third-party API specifics are cleanly separated.
- **Dependency inversion**: `@repo/server` depends on abstractions (`@repo/types`), not on concrete adapter packages. Adapters depend on `@repo/types` and `AppContext`, not on `@repo/server`.
- **Trade-off**: A room's capabilities depend on which adapters are configured, requiring runtime capability checks.
- **Trade-off**: OAuth token management is complex; the room creator's tokens are used for playback and library operations, with server-side refresh handling.
