# 0068. Private-Scoped Plugin Config Fields and Shared Schema-Driven Authoring

**Date:** 2026-07-06
**Status:** Accepted

## Context

Plugins declare their admin settings with `getConfigSchema()` (a `PluginConfigSchema` of `jsonSchema` + `layout` + `fieldMeta`), and the web app renders that schema generically via `DynamicPluginSettings` / `PluginConfigForm`. Config is stored server-side in Redis at `room:{roomId}:plugins:{name}:config` and read back by the plugin through `BasePlugin.getConfig()`.

Two limitations block a class of features — most immediately scheduler-drafted quizzes (`plans/quiz-sessions.md`, `plans/scheduler-quiz-drafting.md`), but the constraints are general:

1. **All config is broadcast.** The `:config` key is not inherently public, but three projection steps copy it to every connected client: room hydration on join (`INIT`), `ROOM_SETTINGS_UPDATED` (via `getAllPluginConfigs()`), and the room-schedule snapshot (which embeds `segment.pluginPreset`, itself a bundle of `pluginConfigs`). Any field a plugin author wants kept server-side (quiz `acceptedAnswers`, answer keys, secret thresholds) leaks through these surfaces. This is the same secrecy problem that pushed polls to core (ADR 0061, reason 3).

2. **No repeatable/object-array field type.** `PluginFieldType` covers scalars and scalar arrays (`string-array`, `checkbox-group`) but not arrays of objects. Authoring a quiz question bank (`{ text, acceptedAnswers[] }[]`) or any list-of-records structure cannot be expressed in the schema, forcing bespoke admin UI per plugin (ADR 0061 reason 2 documents the same gap for poll options).

3. **The renderer is web-only.** `PluginConfigForm` lives in `apps/web`, which `apps/scheduler` may not import (ADR 0020). Any schema-driven authoring outside the room (e.g. the scheduler) has no shared renderer to reuse.

We want a **general** primitive rather than a quiz-specific transport. The prior draft of `plans/scheduler-quiz-drafting.md` proposed a bespoke `quizPreset` column, `validateQuizPreset`, a `seedSessionFromPreset` plugin action, and an `activateRoomSegment` hook — all specific to secret quizzes. That solves one feature while adding a parallel stack that the next secret-authored plugin would have to duplicate.

## Decision

Introduce a plugin-system primitive: **config fields may be scoped `private`, meaning they are authored through the same schema-driven form but stored server-side only and never placed on any broadcast surface.** Pair it with a **shared schema renderer** and an **object-array field type** so plugin authoring is uniform across the room admin and the scheduler.

### 1. `private` field scope

- `PluginFieldMeta` gains `scope?: "public" | "private"` (default `"public"`). `private` communicates "server-side only, never sent to non-admin clients."
- **Split storage (fail-safe over redaction).** Public fields stay in `room:{roomId}:plugins:{name}:config`. Private fields are written to a sibling server-only key `room:{roomId}:plugins:{name}:private`. Broadcast projections (`INIT`, `ROOM_SETTINGS_UPDATED`, schedule snapshot) only ever read `:config`, so there is physically nothing to leak — as opposed to a redaction approach where any future projection surface that forgets to strip private fields silently re-leaks.
- **Transparent read.** `BasePlugin.getConfig()` merges `:config` + `:private` (+ defaults) server-side, so plugin runtime code is oblivious to the split. `getComponentState()` and every broadcast continue to see only public data.
- **Write routing is schema-driven.** The config write path (`setRoomSettings` → `setPluginConfig`) consults the plugin's schema (available on the server via `pluginRegistry`) to route each field to `:config` or `:private`. Plugins never hand-manage the split.

### 2. Admin-gated, on-demand fetch of private fields (reuse the existing pull)

Private fields must reach **admins** on the client for editing (e.g. re-editing a quiz's accepted answers), without touching the broadcast bus. This reuses the pattern the codebase already has: **per-socket, role-gated request/response pulls** (`getRoomSettings` → `ROOM_SETTINGS` already emits `isAdmin ? room : removeSensitiveRoomAttributes(room)` to `socket.id`). An admin opening a plugin's config editor fetches the merged config (public + private) for that plugin via an admin-authorized request/response; guests and every room-wide **push** (`INIT` room hydration to non-admins, `ROOM_SETTINGS_UPDATED`, the schedule snapshot) carry public fields only.

We deliberately do **not** add a `private-admin` scope that would push private fields to admins on the room-wide broadcast. That would require making `ROOM_SETTINGS_UPDATED` and the (shared, publicly-read — ADR 0029) schedule snapshot role-aware, plus re-sending on mid-session role changes (deputize-on-join) — more complexity in the secrecy-critical broadcast path, not less. It is also worse for least privilege: an admin is frequently also *playing* the quiz, so pushing the answer key into every admin's client at join would self-spoil them and widen the exposure window. On-demand fetch keeps private data out of admin clients until they explicitly edit. A single `private` scope + on-demand pull covers the need.

### 3. Object-array (repeatable group) field type

- `PluginFieldType` gains a repeatable-group type (e.g. `"object-array"`) whose `fieldMeta` declares the per-item sub-fields (each itself a `PluginFieldMeta`, including `scope`). The renderer supports add/remove/reorder of item rows.
- A field can be both `scope: "private"` and an object-array (the quiz question bank is exactly this): private, schema-rendered, repeatable authoring.

### 4. Shared schema renderer

- Extract the schema-driven form renderer into a shared package (`@repo/plugin-config-ui`) depending only on `@repo/types` (and UI libs), so both `apps/web` and `apps/scheduler` render the same schema identically (respects ADR 0020's `apps/scheduler` isolation).
- `apps/web`'s `DynamicPluginSettings` and the scheduler's segment-authoring UI both consume it.

### 5. Scheduler: generic private plugin content on a segment

- A segment carries public plugin config through the existing `pluginPreset` field (broadcastable — unchanged). Private fields authored in the scheduler are stored in a **generic** server-only column on the segment (a private-plugin-content blob keyed by plugin name), **never** included in `RoomScheduleSnapshotSegmentDTO` or the schedule snapshot.
- On segment activation, the fan-out writes public → room `:config` and private → room `:private`. The plugin self-starts from its own (now-merged) config on `CONFIG_CHANGED` / activation. This generalizes the abandoned quiz-specific `quizPreset` + `seedSessionFromPreset` into a primitive any plugin can use.

## Consequences

### Positive

- **Secrecy by construction.** Private data never enters the objects that broadcast surfaces serialize, so new projection surfaces cannot re-leak it. No per-surface redaction to maintain.
- **One authoring model.** A single schema + shared renderer drives room-admin and scheduler authoring; the `object-array` type removes the need for bespoke per-plugin forms (quiz, and retroactively poll-like lists).
- **General, not quiz-specific.** Replaces a parallel `quizPreset` transport with a reusable `private` scope + generic segment private-content store that future plugins inherit for free.
- **Backward compatible.** `scope` defaults to `public`; existing plugins and configs are unaffected. The `:private` key and admin fetch are additive.
- **Two scopes, no third.** `public | private` only. We rejected a `private-admin` (broadcast-to-admins) scope: it adds no capability the on-demand pull lacks, forces role-aware broadcasts + snapshot, and self-spoils admin-players. Fewer scopes is also less confusing for plugin developers.

### Negative / trade-offs

- **Admin fetch authorization.** The on-demand merged-config fetch reuses the existing per-socket, role-gated pull pattern (`ROOM_SETTINGS`'s `isAdmin` gate), but it now carries private fields — a bug in that gate could expose them to non-admins.
- **Write path needs schema at write time.** `setRoomSettings` and the scheduler activation fan-out must reliably resolve the plugin's schema to route fields. If a schema is unavailable, the safe default is to treat unknown fields as `private` (fail closed) rather than broadcast them.
- **Two keys per plugin per room.** Config reads that need private data incur an extra Redis read; `getConfig()` merges them. Cleanup, export, and preset tooling must account for both `:config` and `:private`.
- **Renderer extraction cost.** Moving `PluginConfigForm` into `@repo/plugin-config-ui` is a refactor touching web imports; the `object-array` type adds nested-field rendering, validation, and `showWhen` semantics for sub-fields.
- **Editing UX depends on fetch availability.** If the admin fetch fails, an existing private field cannot be pre-populated for edit; the form must handle this without silently blanking stored private data.

### Deferred / out of scope

- Per-field encryption at rest (private fields are plaintext in Redis, same as all room data — ADR 0003).
- Exposing private fields in plugin preset JSON export/import (presets remain public-config bundles; private content is authored per-room or per-segment).
- Migrating existing plugins' bespoke admin forms to the `object-array` type (opportunistic follow-up).
