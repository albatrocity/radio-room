# 0007. Unit Tests for Platform-Critical Behavior

**Date:** 2025-01-01
**Status:** Accepted

## Context

The Listening Room has a broad surface area: Socket.IO handlers, business logic operations, adapter integrations, plugin behavior, and a complex frontend. Testing every line of code would be expensive to maintain and would not proportionally reduce risk. The most impactful bugs occur in platform-critical paths: event handling, room lifecycle, queue management, authentication, and plugin behavior.

## Decision

Write **unit tests focused on platform-critical behavior** using **Vitest** as the test framework.

- **Test scope**: Handlers, services, operations, plugin logic, and adapter behavior. Tests validate the contracts and business rules that, if broken, would degrade the core experience.
- **Test infrastructure**: Vitest with Node environment, global test APIs, and mock reset between tests. Path aliases (`@` → package root) mirror the source code.
- **Factories**: Tests use `@repo/factories` for fixture creation (see [ADR 0002](0002-factories-for-test-data.md)), keeping tests concise and resilient to type changes.
- **Test location**: Co-located with source files (`*.test.ts` alongside `*.ts`) in `packages/server/`, `packages/plugin-*/`, `packages/plugin-base/`, and `packages/adapter-*/`.
- **Frontend tests**: Not yet implemented for the web client. The web app has Vitest as a dependency for future use.

## Consequences

- **High-value coverage**: Tests protect the paths where failures would be most visible to users (broken playback, lost queue items, auth failures).
- **Maintainable**: Focused scope means the test suite stays fast and relevant as features evolve.
- **Factory-backed**: Shared factories reduce test brittleness and boilerplate.
- **Trade-off**: Lower coverage in areas deemed non-critical (e.g., UI rendering, theme logic) means some regressions may only be caught manually or in integration.
- **Trade-off**: Frontend test coverage is a known gap to be addressed.
