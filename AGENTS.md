# AI Agent Guidelines

This document provides guidelines for AI agents working with the Listening Room codebase.

## Architectural Decision Records

**Before implementing any feature or refactor**, review the relevant ADRs in [`docs/adrs/`](docs/adrs/index.md). ADRs document the architectural decisions that shape this codebase. Your implementation must align with these decisions unless you are explicitly proposing to supersede one.

### Workflow

1. **Review before implementing**: Read the [ADR index](docs/adrs/index.md) and any ADRs related to the area you are working in. For example, if you are adding a new Socket.IO handler, review [ADR 0008](docs/adrs/0008-system-events-and-broadcaster-pattern.md), [ADR 0010](docs/adrs/0010-controller-hof-closure-pattern.md), and [ADR 0014](docs/adrs/0014-emit-domain-events-from-operations-only.md).
2. **Align your approach**: Ensure your implementation follows the patterns and constraints described in the relevant ADRs. If you are unsure whether a decision applies, err on the side of following it and flag the question.
3. **Create new ADRs**: When you make an architectural decision during feature development (e.g., choosing a data structure, introducing a new pattern, selecting a library, changing an integration approach), create a new ADR in `docs/adrs/`. Use the next available number and follow the template in the [index](docs/adrs/index.md). Update the index table with the new entry.
4. **Propose superseding**: If you believe an existing ADR should be changed, create a new ADR with status "Accepted" that describes the new decision, and update the old ADR's status to "Superseded by [NNNN]".

## Documentation References

For detailed documentation, see:

- **[ADR Index](docs/adrs/index.md)** - Architectural Decision Records
- **[Backend Development](docs/BACKEND_DEVELOPMENT.md)** - SystemEvents, Broadcaster pattern, server architecture
- **[Plugin Development](docs/PLUGIN_DEVELOPMENT.md)** - Creating plugins (index with links to focused guides: events, UI components, storage, game sessions, etc.)
- **[Metadata Source Access](docs/plugins/metadata-source-access.md)** - Bridge source grants (`listMetadataSources`, `grantMetadataSourceAccess`)
- **[Media Bridge local testing](docs/BRIDGE_LOCAL_TESTING.md)** - Daemon + DJ Mac pack workflow
- **[Web Client](apps/web/README.md)** - XState actors, Socket.IO integration, React patterns
- **[Game Studio](apps/game-studio/README.md)** - Local sandbox for plugin/game UI; pair with `studio-bridge`

---

## Project Structure

This is a **Turborepo monorepo** using npm workspaces.

```
listening-room/
├── apps/
│   ├── api/              # Express + Socket.IO server entry point
│   ├── web/              # React frontend (Vite, XState v5, Chakra UI v3)
│   ├── game-studio/      # Plugin/game sandbox (pairs with studio-bridge for Room UI preview)
│   ├── studio-bridge/    # Local stub API + Socket.IO for Game Studio → web preview (`make game-studio`)
│   ├── scheduler/        # Show scheduling admin (Vite + React)
│   ├── load-tester/      # Load testing CLI tool
│   ├── local-remote/     # Rust daemon: remote Redis SYSTEM:*, macOS Now Playing watcher, local config UI
│   └── bridge-daemon/    # Node Media Bridge (CDP/mpv, Redis RPC); supervised by local-remote on DJ Mac
│
├── packages/
│   ├── server/       # Core server logic (handlers, operations, services)
│   ├── types/        # Shared TypeScript types
│   ├── adapter-*/    # Media/metadata source adapters (Spotify, Tidal, Shoutcast, RTMP, Bridge)
│   ├── plugin-*/     # Room plugins (playlist-democracy, special-words, round-robin-dj, music-upload)
│   ├── plugin-base/  # Base class for plugins
│   ├── factories/    # Test factories for mocking data
│   ├── utils/        # Shared utilities
│   └── eslint-config/
│
└── docs/             # Detailed documentation
```

### Package Naming

- Internal packages use `@repo/` prefix (e.g., `@repo/server`, `@repo/types`)
- Adapters: `@repo/adapter-{name}` (spotify, tidal, shoutcast, rtmp, bridge)
- Plugins: `@repo/plugin-{name}` (playlist-democracy, special-words, round-robin-dj, music-upload, queue-theme, …). Music Upload: plugin owns persona + UI store; core owns presigned PUT REST ([ADR 0119](docs/adrs/0119-private-music-uploads-presign.md)).

---

## Key Architectural Patterns

### Backend

| Pattern               | Location                                 | Purpose                                                               |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| **SystemEvents**      | `packages/server/lib/SystemEvents.ts`    | Unified event emission to Redis, plugins, and broadcasters            |
| **Broadcasters**      | `packages/server/lib/broadcasters/`      | Route system events to Socket.IO channels                             |
| **Handlers**          | `packages/server/handlers/`              | Socket.IO event handlers (one per event type)                         |
| **Operations**        | `packages/server/operations/`            | Business logic functions called by handlers                           |
| **Services**          | `packages/server/services/`              | External integrations and data access                                 |
| **Room Type Helpers** | `packages/server/lib/roomTypeHelpers.ts` | Reusable predicates for room type logic (e.g., `hasListenableStream`) |

### Frontend

| Pattern                        | Location                                                                          | Purpose                                                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Singleton Actors**           | `apps/web/src/actors/`                                                            | XState actors managing domain state                                                                                                                                                                                                                                                    |
| **Machines**                   | `apps/web/src/machines/`                                                          | XState machine definitions (logic only)                                                                                                                                                                                                                                                |
| **socketActor**                | `apps/web/src/actors/socketActor.ts`                                              | Central Socket.IO hub, broadcasts to actors                                                                                                                                                                                                                                            |
| **`subscribeById` allowlists** | `socketActor.subscribeById(id, { send, eventTypes? })`                            | Optional `eventTypes` filters which `SERVER_EVENT` types reach a subscriber ([ADR 0093](docs/adrs/0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md)); omit for unfiltered delivery. `SOCKET_ONLINE` / `SOCKET_OFFLINE` / `SOCKET_RECONNECTING` always fan out |
| **Plugin component registry**  | `apps/web/src/actors/pluginComponentRegistry.ts` + `PluginComponentsRoomProvider` | One `pluginComponentMachine` actor per `pluginName` per room; `teardownRoom` calls `teardownPluginComponentActors()` to clear the registry ([ADR 0093](docs/adrs/0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md))                                           |
| **ACTIVATE/DEACTIVATE**        | Room-scoped actors                                                                | Lifecycle pattern for room entry/exit                                                                                                                                                                                                                                                  |
| **Room Type Helpers**          | `apps/web/src/lib/roomTypeHelpers.ts`                                             | Client-side room type predicates (mirrors backend helpers)                                                                                                                                                                                                                             |

### Plugin System

| Concept              | Description                                               |
| -------------------- | --------------------------------------------------------- |
| **BasePlugin**       | Extend this class for new plugins (`@repo/plugin-base`)   |
| **Event Handlers**   | Use `this.on("EVENT_NAME", handler)` for type-safe events |
| **Config Schema**    | Define with Zod, generates admin UI automatically         |
| **Component Schema** | Declarative UI components (no React in plugins)           |
| **Storage**          | Redis-backed, namespaced per plugin/room                  |

### Room Types

| Type        | MediaSource | Description                                                                        |
| ----------- | ----------- | ---------------------------------------------------------------------------------- |
| **jukebox** | `spotify`   | On-demand playback via Spotify Connect                                             |
| **radio**   | `shoutcast` | Shoutcast/Icecast stream with embedded metadata                                    |
| **live**    | `rtmp`      | RTMP ingest via MediaMTX, WebRTC/LL-HLS output, metadata via `local-remote` daemon |

When adding logic that depends on room type, prefer using helper functions from `roomTypeHelpers.ts` rather than direct `room.type` checks. For example, use `hasListenableStream(room)` instead of `room.type === "radio" || room.type === "live"`. This keeps room-type knowledge centralized and makes it easy to add new stream-backed types. See [ADR 0034](docs/adrs/0034-live-room-type-rtmp-adapter.md).

### Infrastructure

| Service          | Location                                       | Purpose                                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MediaMTX**     | `infra/mediamtx/`                              | RTMP ingest, WebRTC (WHEP) + LL-HLS output for live rooms                                                                                                                                                                                                 |
| **Media Bridge** | `apps/bridge-daemon/` + `@repo/adapter-bridge` | DJ Mac composite playback (`playbackControllerId: "bridge"`); Redis RPC + CAPABILITIES; pack via `npm run pack:dj-mac` ([ADR 0077](docs/adrs/0077-bridge-composite-playback-controller.md)–[0084](docs/adrs/0084-dj-mac-single-zip-supervised-bridge.md)) |

MediaMTX runs locally via `docker compose --profile live up` and is deployed to a VPS via `.github/workflows/deploy-mediamtx.yml`.

---

## Common Tasks

### Adding a Socket.IO Handler

1. Create handler in `packages/server/handlers/{eventName}.ts`
2. Export from `packages/server/handlers/index.ts`
3. Register in `packages/server/index.ts`

### Adding a System Event

1. Define type in `packages/types/SystemEventTypes.ts`
2. Emit via `context.systemEvents.emit(roomId, "EVENT_NAME", data)`
3. Handle in plugins via `this.on("EVENT_NAME", handler)`

### Creating a Plugin

1. Create `packages/plugin-{name}/` directory
2. Extend `BasePlugin<TConfig>` from `@repo/plugin-base`
3. Define Zod schema for configuration
4. Register in `apps/api/src/server.ts`

See [Plugin Development Guide](docs/PLUGIN_DEVELOPMENT.md) for full details.

### Adding a MediaSource Adapter

1. Create `packages/adapter-{name}/` with `index.ts` implementing `MediaSourceAdapter`
2. Add the source type to `mediaSourceTypeSchema` in `packages/types/TrackSource.ts`
3. Register in `apps/api/src/server.ts` `mediaSources` array
4. Add a branch in `configureAdaptersForRoomType` in `packages/server/controllers/roomsController.ts`
5. If adding a new room type, add it to `Room.type` union in `packages/types/Room.ts` and update `roomTypeHelpers.ts`

### Media Bridge (`@repo/adapter-bridge` + `bridge-daemon`)

Bridge is a **playback controller** (and YouTube/local metadata sources), not a new `room.type`. Prefer extending `@repo/adapter-bridge` / daemon drivers over scattering Redis RPC in handlers.

1. Protocol / RPC: `packages/adapter-bridge/lib/protocol.ts` and daemon `apps/bridge-daemon/`
2. Server link/status: `packages/server/services/MediaBridgeService.ts` + `operations/bridge/publishMediaBridgeStatus.ts`
3. Room policy / access: `metadataSourceIds` ([ADR 0087](docs/adrs/0087-room-bridge-media-source-policy.md)), `metadataSourceAccess` + plugin grants ([ADR 0088](docs/adrs/0088-metadata-source-access-grants.md)); plugin guide: [Metadata Source Access](docs/plugins/metadata-source-access.md)
4. Local / pack testing: [BRIDGE_LOCAL_TESTING.md](docs/BRIDGE_LOCAL_TESTING.md) (`npm run serve -w bridge-daemon`, `npm run pack:dj-mac`). Do not commit `apps/bridge-daemon/dist-bundle/` (generated by `npm run bundle -w bridge-daemon`).

### Adding a Frontend Actor

1. Create machine in `apps/web/src/machines/{name}Machine.ts`
2. Create actor in `apps/web/src/actors/{name}Actor.ts`
3. Export hooks from `apps/web/src/hooks/useActors.ts`
4. If room-scoped, add ACTIVATE/DEACTIVATE handling
5. When subscribing via `subscribeById`, pass `eventTypes` for the `SERVER_EVENT` types the machine handles (hot room machines should not use unfiltered subscriptions — see [ADR 0093](docs/adrs/0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md) and [apps/web/README.md](apps/web/README.md))

### Agent Skills (`.claude/skills` and `.cursor/skills`)

The repo carries the same skills for two tools. They are **deliberately not identical**
and must not be flattened into copies of each other:

- `.cursor/skills/*` use Cursor's conventions — `disable-model-invocation` frontmatter,
  the `AskQuestion` tool, unprefixed skill names, and `plans/<name>.plan.md` output
  with YAML frontmatter so Cursor renders its interactive plan UI.
- `.claude/skills/*` use Claude Code's — the `AskUserQuestion` tool and
  `dev-suite:`-prefixed skill references.

When you change a skill, port the **substantive** guidance to the sibling copy and
leave each file's tool-specific frontmatter, tool names, and path conventions alone.
`.claude/skills/adrs` has no Cursor counterpart; add one only if Cursor needs it.

### Keeping Game Studio Updated

When adding features that affect the web app's room UI (new Socket.IO events, game state changes, plugin components, queue/playlist behavior), ensure the **studio-bridge** (`apps/studio-bridge`) supports them:

1. Add any new events to `apps/studio-bridge/src/server.ts`
2. Update `BridgeSnapshot` in `apps/studio-bridge/src/types.ts` if new data fields are needed
3. Test with `make game-studio` to verify the preview works

This keeps **Game Studio** (`apps/game-studio`) useful for rapid plugin/game feature iteration without running the full backend.

---

## Development Commands

```bash
# Install dependencies
npm install

# Start all services (Docker)
docker compose up

# Start with MediaMTX for live rooms
docker compose --profile live up

# Run dev servers (without Docker)
npm run dev

# Run tests
npm test

Uses `turbo run test --continue=always` so one failing package (e.g. server tests on an older Node than `packages/server`’s `engines`) does not skip the rest of the workspaces. For a single package: `npm test -w @repo/plugin-guess-the-tune`.

# Lint
npm run lint

# Build all packages
npm run build
```

---

## Code Style Notes

- **XState v5**: Use `setup()` pattern, event objects (not strings), `guard` (not `cond`)
- **TypeScript**: Strict mode, prefer explicit types for public APIs
- **Imports**: Use `@repo/` aliases for internal packages
- **Events**: SCREAMING_SNAKE_CASE for system events
- **Files**: camelCase for files, PascalCase for components/classes
