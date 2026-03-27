# Architectural Decision Records

This directory contains Architectural Decision Records (ADRs) for the Listening Room project. ADRs document significant architectural and design decisions along with their context and consequences.

## ADR Index

| # | Decision | Status |
|------|----------|--------|
| [0001](0001-monorepo-with-turborepo.md) | Monorepo with Turborepo and npm Workspaces | Accepted |
| [0002](0002-factories-for-test-data.md) | Factories for Test Data | Accepted |
| [0003](0003-redis-for-ephemeral-room-data.md) | Redis for Ephemeral Room Data | Accepted |
| [0004](0004-state-machines-for-ui-and-socket-events.md) | State Machines for UI and Socket Event Handling | Accepted |
| [0005](0005-adapter-pattern-for-media-services.md) | Adapter Pattern for Media Services | Accepted |
| [0006](0006-plugin-system-for-room-features.md) | Plugin System for Room Features | Accepted |
| [0007](0007-unit-tests-for-platform-critical-behavior.md) | Unit Tests for Platform-Critical Behavior | Accepted |
| [0008](0008-system-events-and-broadcaster-pattern.md) | SystemEvents and Broadcaster Pattern | Accepted |
| [0009](0009-screaming-snake-case-for-socket-events.md) | SCREAMING_SNAKE_CASE for Socket Wire Protocol | Accepted |
| [0010](0010-controller-hof-closure-pattern.md) | Controller HOF + Closure Pattern | Accepted |
| [0011](0011-dependency-injection-via-app-context.md) | Dependency Injection via AppContext | Accepted |
| [0012](0012-server-side-oauth-no-client-tokens.md) | Server-Side OAuth with No Client-Side Token Exposure | Accepted |
| [0013](0013-track-identity-media-and-metadata-sources.md) | Track Identity via Explicit Media and Metadata Sources | Accepted |
| [0014](0014-emit-domain-events-from-operations-only.md) | Emit Domain Events from Operations Only | Accepted |
| [0015](0015-postgresql-for-persistent-user-data.md) | PostgreSQL for Persistent User Data | Accepted |
| [0016](0016-better-auth-with-drizzle-for-platform-authentication.md) | Better-Auth with Drizzle for Platform Authentication | Accepted |

## Creating a New ADR

1. Copy the template below into a new file: `docs/adrs/NNNN-title.md` (use the next available number, zero-padded to 4 digits).
2. Fill in the Context, Decision, and Consequences sections.
3. Add an entry to the index table above.

### Template

```markdown
# NNNN. Title

**Date:** YYYY-MM-DD
**Status:** Accepted | Proposed | Deprecated | Superseded by [NNNN]

## Context

Why this decision was needed.

## Decision

What was decided.

## Consequences

What follows from the decision -- both positive and negative.
```
