# 0011. Dependency Injection via AppContext

**Date:** 2025-01-01
**Status:** Accepted

## Context

Adapter packages (`@repo/adapter-spotify`, `@repo/adapter-tidal`, etc.) initially imported directly from `@repo/server` to access data operations and other server internals. This created **circular dependencies** (server depends on adapters which depend on server) and tight coupling that made adapters non-portable and hard to test.

## Decision

Use an **`AppContext` object** as the dependency injection mechanism, passed through the call chain rather than relying on direct cross-package imports.

- **`AppContext`** (`packages/types/AppContext.ts`) defines the contract: `redis`, `adapters`, `jobs`, `jobService`, `pluginRegistry`, `systemEvents`, `apiUrl`, and an optional `data` object for CRUD operations (e.g., `getUserServiceAuth`, `storeUserServiceAuth`).
- **Server** (`packages/server/lib/context.ts`) creates the concrete `AppContext` by closing over real implementations.
- **Adapters** depend only on `@repo/types` for the `AppContext` interface. They call `context.data.*` or `context.adapters.*` without importing `@repo/server`.
- **Handlers and operations** receive `AppContext` from the controller layer (see [ADR 0010](0010-controller-hof-closure-pattern.md)).

This follows the **Dependency Inversion Principle**: high-level modules (server) and low-level modules (adapters) both depend on abstractions (the `AppContext` interface in `@repo/types`).

## Consequences

- **No circular dependencies**: Adapters never import `@repo/server`; the dependency graph is acyclic.
- **Portable adapters**: Adapter packages can be tested with a mock `AppContext` without standing up a server.
- **Swappable implementations**: The `data` operations behind `AppContext` can be replaced (e.g., for testing or alternative storage) without changing consumers.
- **Single entry point**: `AppContext` is the canonical way to access shared infrastructure; no hidden singletons or global state.
- **Trade-off**: `AppContext` can grow large; discipline is needed to avoid turning it into a god object. Future options include splitting into focused sub-contexts or using a DI container.

See also: [work-history/DEPENDENCY_INJECTION_REFACTOR.md](../../work-history/DEPENDENCY_INJECTION_REFACTOR.md)
