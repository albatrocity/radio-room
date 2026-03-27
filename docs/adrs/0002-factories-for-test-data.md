# 0002. Factories for Test Data

**Date:** 2025-01-01
**Status:** Accepted

## Context

Server handlers, services, operations, plugins, and adapters all need realistic test data: users, rooms, queue items, chat messages, reactions, metadata source tracks, Redis contexts, and full `AppContext` objects. Duplicating fixture construction across test files leads to drift, verbosity, and fragile tests that break when types change.

## Decision

Maintain a dedicated **`@repo/factories`** package that exports factory functions for all core domain objects.

- Each factory returns a valid object with sensible defaults that can be overridden via partial arguments.
- Factories are exported from: `appContext`, `chatMessage`, `queueItem`, `reaction`, `room`, `user`, `metadataSourceTrack`.
- The factories package depends on `@repo/types` for type definitions.
- Both test suites (`packages/server/`, `packages/plugin-*/`, `packages/adapter-*/`) and the `apps/load-tester` consume these factories.

## Consequences

- **Single source of truth** for test object shapes; when a type changes, only the factory needs updating.
- **Readable tests**: Tests express only the fields they care about; defaults handle the rest.
- **Reuse beyond tests**: The load tester uses the same factories for synthetic data generation, ensuring consistency between test and load scenarios.
- **Trade-off**: Adding a new domain type requires creating a corresponding factory and keeping it in sync with the type definition.
