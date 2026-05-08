# 0052. Global artifacts API (`context.artifacts`)

**Date:** 2026-05-08  
**Status:** Accepted

## Context

Some gameplay features need durable, cross-room storage that is not tied to a single room’s plugin-scoped Redis keys or an active game session. Examples include password-protected “stash” items where players deposit coins or inventory stacks for later retrieval by anyone who knows the secret.

Allowing plugins to call Redis (`context.appContext.redis`) directly for this would bypass established boundaries and make key discipline and evolution harder to audit.

## Decision

Introduce a first-class **`ArtifactsPluginAPI`** exposed as **`context.artifacts`** on `PluginContext`, alongside `storage`, `game`, and `inventory`.

- **Implementation:** `PluginArtifactsAPI` in `@repo/server` reads/writes a single global Redis hash (`global:storedArtifacts`), serialized as JSON per artifact id.
- **Surface:** `store`, `getAll` (password-stripped public rows), `attemptRetrieve` (distinguishes missing vs wrong password), `remove`.
- **Lifecycle:** Shared service instance is attached to `AppContext` during server startup (same phase as `InventoryService`). Plugin instances receive the same API object in their context.
- **Wire protocol:** Clients list and retrieve via Socket.IO events (`GET_STORED_ARTIFACTS`, `RETRIEVE_STORED_ARTIFACT`) handled in `roomsController`, which uses `AppContext.artifacts` plus core inventory / game session services — not plugin instances — so retrieval works without routing through a specific room plugin.

Passwords are stored in plaintext per product requirement (not a security boundary).

## Consequences

- **Positive:** Clear abstraction; Redis layout and evolution stay centralized; plugins remain testable with a small mock API.
- **Positive:** Cross-room persistence without exposing raw Redis to plugin code.
- **Negative:** Another global Redis namespace to manage (backup/migration considerations).
- **Negative:** Retrieval flows depend on core services (`InventoryService`, `GameSessionService`) for crediting users; handlers must stay aligned with session/inventory rules (e.g. full inventory on item retrieval).
