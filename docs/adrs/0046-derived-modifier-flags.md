# 0046. Derived Modifier Flags via `getActiveFlags`

**Date:** 2026-05-02
**Status:** Accepted

## Context

`GameStateEffect` includes **`{ type: "flag", name, value }`**, and **`UserGameState`** allows optional **`flags`**, but **`GameSessionService`** does not persist **`flags`** on write. Flag semantics for scoring attributes were never wired into **`evaluateModifiers`** the way **`multiplier`** / **`lock`** are. Plugins still need a reliable way to read “does this user currently have flag X?” from modifier data that is already stored on **`UserGameState.modifiers`**.

## Decision

Expose a **pure helper** **`getActiveFlags(modifiers, now): Record<string, boolean>`** from **`@repo/game-logic`** (types live in **`@repo/types`**; implementation is pure logic and must not create a **`@repo/types` ↔ `@repo/game-logic`** dependency cycle). It walks non-expired modifiers (same time window as modifier evaluation) and folds **`flag`** effects into a string-keyed map.

This is the **canonical read path** for flag-style effects until/unless we denormalize **`UserGameState.flags`** on apply/remove.

## Consequences

### Positive

- No Redis schema migration; aligns with existing lazy expiry of modifiers.
- Single source of truth: the modifier list already persisted per user.

### Negative / trade-offs

- **O(modifiers)** per read; acceptable for typical modifier counts.
- Call sites must pass **`modifiers`** (and optionally rely on **`getUserState`** pruning).

## References

- [ADR 0042 — Game Sessions and Inventory](0042-game-sessions-and-inventory.md)
- `packages/game-logic/src/getActiveFlags.ts`
- `packages/server/services/GameSessionService.ts`
