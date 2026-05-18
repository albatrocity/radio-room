# 0057. User Personas System

**Date:** 2026-05-15
**Status:** Accepted

## Context

Room admins need to mark certain listeners as important to the session (e.g. a musician who performed earlier) without granting them admin powers. Plugins also need session-scoped identity labels ("Judge" in a DJ battle, "It" in tag) that are visible in the user list and chat, without coupling plugins to each other.

Admin designation today is a boolean privilege (`isAdmin`) with real authorization impact. Personas must remain **display and semantics only** — no overlap with admin, DJ, or modifier mechanics.

## Decision

Introduce **user personas** as core infrastructure (`PersonaService` on `AppContext`), with a plugin-facing `context.personas` API (same pattern as game sessions and inventory in ADR 0042).

### Data model

- **`PersonaDefinition`**: `id`, `label`, optional `icon`, `source` (`"platform"` or plugin name), optional `exclusive` (at most one holder in the room), optional `assignableByAdmin`, `decoratesUser`, `decoratesChatMessage`.
- **`UserPersonaAssignment`**: stored per user per room (`personaId`, `assignedBy`, `assignedAt`).
- **Wire format**: `User.personas` — hydrated array of `{ personaId, label, icon?, decoratesUser?, decoratesChatMessage? }` on room user reads and `USER_JOINED` / persona events.
- **Admin menu wire**: `assignablePersonas` on login `INIT` and `PERSONA_DEFINITIONS_UPDATED` — `{ personaId, label, icon? }[]` for definitions with `assignableByAdmin: true`.

### Storage (Redis)

- Definitions: `room:{roomId}:persona:definitions` (HASH)
- Assignments: `room:{roomId}:personas:{userId}` (HASH) — atomic `HSET` / `HDEL` per persona

Platform **VIP** (`id: "vip"`) is registered per room; plugin personas use ids `plugin:{pluginName}:{shortId}`.

### Events

- `PERSONA_ASSIGNED` / `PERSONA_REMOVED` via `SystemEvents` (ADR 0008), emitted from `PersonaService` after successful assign/remove.
- `PERSONA_DEFINITIONS_UPDATED` when plugin definitions register/unregister (assignable list for admin menu).
- Room clients refresh listener lists via `USER_JOINED` with updated `users` (same pattern as admin designation).

### Plugin API

`PersonasPluginAPI` on `PluginContext`: `registerPersonas`, `unregisterPersonas` (on plugin `cleanup()`), `getRoomPersonas`, `assign` / `remove` (own personas only), `getUserPersonas`, `getUsersWithPersona`.

### Personas vs modifiers

- **Persona**: "who is this person?" — identity label, admin/plugin assigned, badge in UI.
- **Modifier** (ADR 0042/0046): "what effect is active?" — gameplay state, timers, scoring/chat transforms.

### Admin UI

- **Admin-assignable personas**: definitions with `assignableByAdmin: true` appear in the listener ellipsis menu; room admins toggle via `TOGGLE_PERSONA` `{ userId, personaId }`. Remove actions use muted label color.
- **VIP** (platform): `assignableByAdmin`, `decoratesUser`, and `decoratesChatMessage` all true.
- **Admin**: room creator only (unchanged).
- Listener row: ellipsis menu for Make Admin / assignable personas / Kick; deputize DJ stays a single-click button.
- **Badges**: `decoratesUser` / `decoratesChatMessage` on definitions control listener-list and chat icons (not limited to VIP).

## Consequences

### Positive

- VIP works with no plugin enabled.
- Plugins define personas without cross-plugin imports; all clients read `user.personas`.
- Clear separation from privileges and game modifiers.

### Negative / trade-offs

- Extra Redis keys and hydration on `getRoomUsers`.
- Chat messages store a snapshot `user`; the web client merges live `personas` from the listeners list for badges.
- Plugin persona registration is tied to plugin enable/disable lifecycle.

## References

- [ADR 0042 — Game Sessions and Inventory](0042-game-sessions-and-inventory.md)
- [ADR 0008 — SystemEvents and Broadcasters](0008-system-events-and-broadcaster-pattern.md)
- `packages/server/services/PersonaService.ts`
- `packages/types/Persona.ts`
