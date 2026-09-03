# 0151. Round Robin forward-and-back mode

**Date:** 2026-09-03
**Status:** Accepted

## Context

Round Robin DJ ([ADR 0091](0091-round-robin-dj-plugin.md)) supports `sequential` (discover then lock turn order, restart each round at the first name) and `nonSequential` (FCFS within each round). Some shows want a snake / ping-pong pass: after A→B→C finishes, C starts the next round, then B, then A, so endpoint deputies naturally go twice across the round boundary.

Reversing the `order` array in place would invalidate `currentIndex`, complicate undo ([ADR 0101](0101-queue-add-undo-and-round-robin-turn-restore.md)), and fight `addDeputy` append semantics. A third mode with a walk direction is clearer than a sequential-only boolean.

## Decision

1. **Config mode** `forwardAndBack` joins `sequential` | `nonSequential` on `RoundRobinDjConfig.mode`. Default remains `sequential`.

2. **Ordered modes** share discovery, lock, Robin persona, defer/hold, and enqueue gating. Helper `isOrderedMode(mode)` is true for `sequential` and `forwardAndBack`. Prefer it over `mode === "sequential"` wherever “has a locked turn order” is meant.

3. **State** persists optional `direction: 1 | -1` (`1` forward / ascending indices, `-1` back). Missing on old JSON → `1`. Sequential always keeps `direction === 1`.

4. **Round boundary:** after everyone has queued, `currentIndex` remains on the person who just queued. For `forwardAndBack`, `startNextRound` **flips `direction` and does not reset `currentIndex`** (clamp to a still-present participant). Sequential still points at the first remaining participant in `order`.

5. **Stepping:** `advanceSequentialIndex` walks `(currentIndex + direction * step)` modulo `order.length`, skipping already-queued or departed deputies.

6. **Undo:** “end of the current round” is last among remaining unqueued people **in the current direction** — append when `direction === 1`, prepend (and bump `currentIndex` if needed) when `direction === -1`. Auto-advance rewind also flips `direction` back.

7. **Nudge:** when `roundAdvanced` and the sole eligible deputy is the user who just queued (endpoint double-turn), include them in `turnStartedFor` so they get the “your turn” toast.

8. **Mode switch:** `sequential` ↔ `forwardAndBack` preserves roster, order, round, and queued state; resets `direction` to `1`. Switch to/from `nonSequential` still full-resets via `createInitialState`.

Admin `deferOutOfTurnQueues` is available for both ordered modes.

## Consequences

- Endpoint double-turns are intentional (two-person rooms feel like B, B / A, A); admin copy should say so.
- New deputies still append to `order` and can become a new reverse endpoint on a later wrap.
- Mid-round admin `advanceRound` starts the next pass from whoever `currentIndex` already points at, then flips direction in this mode.
- Does not supersede ADR 0091 or 0101; extends ordered-mode behavior.

## See also

- [0091. Round Robin DJ plugin](0091-round-robin-dj-plugin.md)
- [0101. Queue-add undo and Round Robin turn restore](0101-queue-add-undo-and-round-robin-turn-restore.md)
- [`packages/plugin-round-robin-dj/`](../../packages/plugin-round-robin-dj/)
