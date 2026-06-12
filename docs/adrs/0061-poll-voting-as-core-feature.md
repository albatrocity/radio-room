# 0061. Poll Voting as a Core Feature

**Date:** 2026-06-10
**Status:** Accepted

## Context

Listening Room rooms need lightweight audience polls: an admin publishes a question with N options, listeners vote (with optional vote swapping), and the admin closes the poll to reveal results. Poll state must appear in the room UI above chat, survive reconnects via `INIT` / `ROOM_DATA` snapshots, and optionally hide per-option tallies and running vote totals until close.

We considered implementing polls as a **room plugin** (ADR 0006). Plugins already receive `SystemEvents`, can post chat messages, and can render declarative UI via `PluginComponentSchema`. However, polls impose requirements that map poorly to the plugin model:

1. **No multi-choice UI primitive.** `PluginComponentSchema` includes `button`, `text`, `badge`, `countdown`, and `leaderboard`, but not a radio group or per-option progress bar. Adding those primitives is core frontend work regardless of where poll logic lives.
2. **Dynamic admin input.** Plugin configuration is static Zod; `executeAction.formFields` does not support arbitrary-length repeating arrays. Poll authoring needs N option labels chosen at runtime.
3. **Secrecy gating.** Plugin component stores fan out room-wide. Hiding per-option counts and `totalVotes` until close would require per-user redaction machinery comparable to ADR 0039's `elementProps` — simpler to implement in a dedicated `pollMachine` and `PollCard`.
4. **Universality.** Polls are useful in every room type (jukebox, radio, live). Per-room plugin opt-in is not a desired product axis.
5. **Snapshot integration.** `activePoll`, `myVote`, and `pollHistory` fit naturally on the login `INIT` payload and incremental `ROOM_DATA` sync. A plugin's `getComponentState` is a less direct fit for per-user vote state.

We chose **core infrastructure**: Redis-backed operations, `SystemEvents`, Socket.IO handlers, a web `pollActor`, and first-party UI components.

## Decision

### Data and persistence

- Poll data lives in Redis under `room:{roomId}:poll:*` keys (ADR 0003). No PostgreSQL tables for v1.
- **One active poll per room** at a time (`:active` pointer). Closing clears the pointer; closed poll metadata and an immutable `:results` snapshot remain for history.
- Votes are stored in a per-poll `:votes` HSET (`userId` → `optionId`). `tryCastVote` uses a single `HSET` for atomic first-vote and swap semantics.
- Per-option tallies are **not** broadcast while a poll is open. `POLL_VOTE_CAST` (first vote only) may include `totalVotes: null` when `hideRunningTotal` is enabled.

### Server surface

| Area | Location |
|------|----------|
| Types | `packages/types/Poll.ts`, `packages/types/InitPayload.ts`, `packages/types/SystemEventTypes.ts` (`POLL_*`) |
| Redis data layer | `packages/server/operations/data/polls.ts` |
| Operations | `packages/server/operations/polls/` (`createPoll`, `castVote`, `closePoll`, `deletePoll`, `formatResults`) |
| Handlers / controller | `packages/server/handlers/pollHandlersAdapter.ts`, `packages/server/controllers/pollController.ts` |
| Snapshots | `packages/server/operations/polls/loadPollSnapshot.ts` (wired in `AuthService`, `RoomService`) |

Domain events (`POLL_PUBLISHED`, `POLL_VOTE_CAST`, `POLL_CLOSED`, `POLL_DELETED`) are emitted from **operations only** (ADR 0014) via `context.systemEvents`.

Socket handlers:
- Public room events through `SystemEvents` → `RoomBroadcaster` (ADR 0008).
- Private `POLL_VOTE_CONFIRMED` / `POLL_VOTE_FAILED` to the voting socket only.
- Admin errors (`CREATE_POLL`, `CLOSE_POLL`, `DELETE_POLL`) via `ERROR_OCCURRED`.

### Web client

| Area | Location |
|------|----------|
| State machine | `apps/web/src/machines/pollMachine.ts` |
| Actor | `apps/web/src/actors/pollActor.ts` (room-scoped `ACTIVATE` / `DEACTIVATE`) |
| Room UI | `apps/web/src/components/Poll/` (`PollCard`, options, results, history modal) |
| Admin authoring | `apps/web/src/components/Modals/Admin/Polls.tsx`, `PollAuthor.tsx` |
| Preferences | `apps/web/src/lib/pollDisplayPreference.ts`, `pollDraftPreference.ts` |

`PollCard` renders above chat when `activePoll` is set. Display mode (`expanded` / `collapsed` / `hidden`) is per-user localStorage with an LRU-capped index (documented race caveat). Vote UX is optimistic with rollback on `POLL_VOTE_FAILED`; open options remain clickable after voting to support swaps.

### Alternatives considered

| Approach | Why not |
|----------|---------|
| **Room plugin** | Missing UI primitives, no dynamic N-option admin form, awkward per-user secrecy, weaker `INIT` integration. |
| **Core with per-room disable flag deferred** | If needed later, a boolean on `Room` settings is cheaper than plugin install/uninstall. |

## Consequences

### Positive

- **First-class room UX.** Poll state hydrates on login and reconnect without plugin lifecycle ordering concerns.
- **Clear secrecy model.** `pollMachine` and operations enforce hidden tallies; no plugin-wide broadcast redaction layer.
- **Reusable patterns.** Follows existing handler → operation → `SystemEvents` flow (ADRs 0008, 0010, 0014) and XState actor conventions (ADR 0004).
- **Plugin compatibility.** New `POLL_*` events extend `SystemEventHandlers`; plugins may observe them but are not required for polls to function.

### Negative / trade-offs

- **More core surface area.** Poll types, Redis keys, handlers, actor, and UI are maintained in `@repo/server` and `apps/web`, not isolated in a plugin package.
- **`hideRunningTotal` timing leak.** Even when totals are hidden, the existence of `POLL_VOTE_CAST` events reveals that someone voted (correlatable in small rooms). Documented; suppressing the event would break vote-count pulse animations.
- **Concurrent tabs, same user.** Last-writer-wins in Redis; each tab respects its own `POLL_VOTE_CONFIRMED`; reload reflects stored truth via `INIT`.
- **Close-path scale.** `closePoll` uses `HGETALL` on the votes hash — fine for listening-room scale (thousands of voters); `HSCAN` chunking is a future escape hatch without API changes.
- **`:results` write ordering.** Results snapshot must be written before `POLL_CLOSED` emits; operation returns an error and skips the event if the write fails.
- **LRU preference races.** `pollDisplayPreference` and `pollDraftPreference` index updates are eventually consistent across concurrent tabs — acceptable for UX prefs.

### Deferred from v1

- `closesAt` auto-close timer (schema reserved, no job wired).
- Admin moderation view of per-voter choices (`:votes` hash retained server-side).
- Per-room poll disable flag (add to `Room` settings if product requires it).
