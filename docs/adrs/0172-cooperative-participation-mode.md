# 0172. Cooperative Participation Mode (Plugin-Local)

**Date:** 2026-09-14
**Status:** Accepted

## Context

[ADR 0062](0062-participation-mode-pvp-vs-pvg.md) defines two shared participation modes for game plugins:

| Mode | Behavior |
|------|----------|
| `competitive` | First actor resolves the scarce reward for everyone. |
| `inclusive` | Each participant earns independently against the room/puzzle. |

Lyric Hero needs a third mode: **cooperative** — one shared board where hits, misses, and the crowd meter are communal, and solve payouts go to the group. Extending `@repo/game-logic`’s `participationModeSchema` would surface a meaningless third option on Quiz Sessions, Guess the Tune, and Playlist Bingo.

## Decision

1. **Plugin-local enum.** Lyric Hero (`@repo/plugin-lyric-hero`) defines its own mode field:
   `z.enum(["competitive", "inclusive", "cooperative"]).default("cooperative")`
   with admin labels that match ADR 0062 for the first two values. Do **not** add `cooperative` to `participationModeSchema` in this change.

2. **Spoiler rules by mode.**
   - **Cooperative:** shared blanks live in the room-wide plugin component store; crowd mood lines are public system messages.
   - **Competitive / inclusive:** each listener has a private board. Filled words must not appear in the room-wide store. Boards hydrate via `contributeToUserGameState` ([ADR 0097](0097-plugin-contribute-to-user-game-state.md)) and live-update via targeted `PluginAPI.emitToUser` (not room-wide `USER_GAME_STATE_INVALIDATED` on every guess). Crowd mood lines are private (`sendUserSystemMessage`). Public announcements on solve must not leak the phrase in inclusive mode; competitive may reveal after the exclusive win ends the round.

3. **Promote later.** When a second plugin needs cooperative, move the three-value schema into `@repo/game-logic` and amend ADR 0062 (or supersede with a new ADR).

## Consequences

- Lyric Hero can ship cooperative without forcing unrelated plugins to handle a third mode.
- Spoiler isolation for per-user boards is an explicit invariant (same-phrase spoilers are easy to leak via the shared store).
- A small amount of duplicated enum/label copy until a second adopter appears.

## See also

- [ADR 0062](0062-participation-mode-pvp-vs-pvg.md) — competitive / inclusive
- [ADR 0097](0097-plugin-contribute-to-user-game-state.md) — private per-user bags
- `packages/plugin-lyric-hero/`
