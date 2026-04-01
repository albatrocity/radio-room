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
- **[Plugin Development](docs/PLUGIN_DEVELOPMENT.md)** - Creating plugins, event system, UI components, storage API
- **[Web Client](apps/web/README.md)** - XState actors, Socket.IO integration, React patterns

---

## Project Structure

This is a **Turborepo monorepo** using npm workspaces.

```
listening-room/
├── apps/
│   ├── api/          # Express + Socket.IO server entry point
│   ├── web/          # React frontend (Vite, XState v5, Chakra UI v3)
│   ├── scheduler/    # Show scheduling admin (Vite + React)
│   ├── load-tester/  # Load testing CLI tool
│   └── local-remote/ # Rust daemon: remote Redis SYSTEM:* + local config UI
│
├── packages/
│   ├── server/       # Core server logic (handlers, operations, services)
│   ├── types/        # Shared TypeScript types
│   ├── adapter-*/    # Media/metadata source adapters (Spotify, Tidal, Shoutcast)
│   ├── plugin-*/     # Room plugins (playlist-democracy, special-words)
│   ├── plugin-base/  # Base class for plugins
│   ├── factories/    # Test factories for mocking data
│   ├── utils/        # Shared utilities
│   └── eslint-config/
│
└── docs/             # Detailed documentation
```

### Package Naming

- Internal packages use `@repo/` prefix (e.g., `@repo/server`, `@repo/types`)
- Adapters: `@repo/adapter-{name}` (spotify, tidal, shoutcast)
- Plugins: `@repo/plugin-{name}` (playlist-democracy, special-words)

---

## Key Architectural Patterns

### Backend

| Pattern | Location | Purpose |
|---------|----------|---------|
| **SystemEvents** | `packages/server/lib/SystemEvents.ts` | Unified event emission to Redis, plugins, and broadcasters |
| **Broadcasters** | `packages/server/lib/broadcasters/` | Route system events to Socket.IO channels |
| **Handlers** | `packages/server/handlers/` | Socket.IO event handlers (one per event type) |
| **Operations** | `packages/server/operations/` | Business logic functions called by handlers |
| **Services** | `packages/server/services/` | External integrations and data access |

### Frontend

| Pattern | Location | Purpose |
|---------|----------|---------|
| **Singleton Actors** | `apps/web/src/actors/` | XState actors managing domain state |
| **Machines** | `apps/web/src/machines/` | XState machine definitions (logic only) |
| **socketActor** | `apps/web/src/actors/socketActor.ts` | Central Socket.IO hub, broadcasts to actors |
| **ACTIVATE/DEACTIVATE** | Room-scoped actors | Lifecycle pattern for room entry/exit |

### Plugin System

| Concept | Description |
|---------|-------------|
| **BasePlugin** | Extend this class for new plugins (`@repo/plugin-base`) |
| **Event Handlers** | Use `this.on("EVENT_NAME", handler)` for type-safe events |
| **Config Schema** | Define with Zod, generates admin UI automatically |
| **Component Schema** | Declarative UI components (no React in plugins) |
| **Storage** | Redis-backed, namespaced per plugin/room |

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

### Adding a Frontend Actor

1. Create machine in `apps/web/src/machines/{name}Machine.ts`
2. Create actor in `apps/web/src/actors/{name}Actor.ts`
3. Export hooks from `apps/web/src/hooks/useActors.ts`
4. If room-scoped, add ACTIVATE/DEACTIVATE handling

---

## Development Commands

```bash
# Install dependencies
npm install

# Start all services (Docker)
docker compose up

# Run dev servers (without Docker)
npm run dev

# Run tests
npm test

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
