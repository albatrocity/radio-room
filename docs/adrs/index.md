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
| [0017](0017-scheduling-app-for-show-programming.md) | Scheduling App for Show Programming | Accepted |
| [0018](0018-url-search-params-for-entity-filters.md) | URL Search Params for Entity Filters (Scheduler) | Accepted |
| [0019](0019-pin-react-18-types-monorepo-wide.md) | Pin React 18 Type Packages Monorepo-Wide | Accepted |
| [0020](0020-plugin-preset-validation-in-repo-utils.md) | Plugin Preset Validation in `@repo/utils` | Accepted |
| [0021](0021-room-attached-show-and-segment-activation.md) | Room-attached Show and Segment Activation | Accepted |
| [0022](0022-rest-guest-authentication.md) | REST guest authentication (listening-room HTTP) | Accepted |
| [0023](0023-publish-playlists-use-room-creator-oauth.md) | Publish playlists use room creator OAuth | Accepted |
| [0024](0024-post-show-publish-and-archive-flow.md) | Post-show publish and archive flow | Accepted |
| [0025](0025-local-remote-rust-daemon.md) | local-remote: Rust daemon + local control UI | Accepted |
| [0026](0026-segment-room-settings-overrides.md) | Segment room settings overrides on activation | Accepted |
| [0027](0027-local-remote-scheduling-ui-cors.md) | local-remote UI: CORS for scheduling API reads | Accepted |
| [0028](0028-room-schedule-redis-snapshot.md) | Room schedule snapshot in Redis + SHOW_SCHEDULE_UPDATED | Accepted |

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
