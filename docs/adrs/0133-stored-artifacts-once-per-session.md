# 0133. Stored artifacts fetched once per game session

**Date:** 2026-08-28
**Status:** Accepted

## Context

[ADR 0130](0130-game-state-overlay-lifecycle-in-machines.md) point 5 moved stored artifacts onto `userGameStateMachine` and said they are fetched with `GET_STORED_ARTIFACTS` whenever a session is present on `USER_GAME_STATE`. That payload also arrives for inventory, gift, and trade updates that do not change storage, so refetching every time was wasted work on the join and Game State hot path.

## Decision

1. **`userGameStateMachine` still owns stored artifacts** (ADR 0130 point 5 otherwise stands: not a view `useState`).
2. **Fetch once per `session.id`.** `requestStoredArtifacts` records `storedArtifactsSessionId` and skips if that id already matches. Session end and actor reset clear it so a later session fetches again.
3. **Explicit refresh still emits.** `refreshStoredArtifacts()` (Stored Items retrieve success, and any other caller) sends `GET_STORED_ARTIFACTS` regardless of session id.

This **partially supersedes [ADR 0130](0130-game-state-overlay-lifecycle-in-machines.md) point 5** (fetch cadence only). Overlay lifecycle in 0130 is unchanged.

## Consequences

- The storage list stays current across a session without a round-trip on every game-state payload.
- A stash created mid-session is not listed until an explicit refresh or a new session id. Retrieve already refreshes; code that stores artifacts should call `refreshStoredArtifacts()` or invalidate game state if the Stored Items tab must update immediately.

## See also

- [0130. Game State overlay lifecycle in machines](0130-game-state-overlay-lifecycle-in-machines.md)
- `apps/web/src/machines/userGameStateMachine.ts` (`requestStoredArtifacts`, `storedArtifactsSessionId`)
- `apps/web/src/actors/userGameStateActor.ts` (`refreshStoredArtifacts`)
