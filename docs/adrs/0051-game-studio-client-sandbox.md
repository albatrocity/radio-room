# 0051. Game Studio — Client-Side Plugin Sandbox

**Date:** 2026-05-06  
**Status:** Accepted

## Context

Testing game plugins (item behaviors, shopping rounds, modifiers, passive defense, chat transforms) currently implies running the full stack: API server, Redis, Socket.IO, and real rooms. Designers need a fast feedback loop to validate pure rules and plugin hooks without that overhead.

## Decision

Introduce **`apps/game-studio`**, a standalone Vite + React app that:

1. **Mocks `PluginContext` at the seam** — Real plugins (starting with `@repo/plugin-item-shops`) run in the browser against in-memory implementations of `PluginAPI`, `GameSessionPluginAPI`, `InventoryPluginAPI`, `PluginStorage`, and plugin lifecycle events.

2. **Centralizes sandbox state in `StudioRoom`** — Users, game session + `UserGameState`, inventories, queue, chat, event logs, and plugin KV/hash storage live in plain JS structures subscribed via React (`snapshotEpoch` + listeners).

3. **Shares pure rules via `@repo/game-logic`** — Defense matching, modifier evaluation/pruning, flag derivation, text-effect stack counting, and shopping-catalog helpers live in a dependency-light package imported by both the production server and Game Studio so behavior cannot drift.

4. **Does not add persistence, audio, or network wire-ups** — No Redis, no Socket.IO transport; optional future ADRs may cover local snapshots only.

## Consequences

- **Pros:** Instant iteration on item UX and rule combinations; easier onboarding for plugin authors; CI can typecheck/build the app without Docker.

- **Cons:** Mock APIs must be maintained when `PluginContext` grows; some orchestration (e.g., multi-step Redis transactions) is simplified or omitted.

- **Related:** Builds on [0042](0042-game-sessions-and-inventory.md), [0049](0049-item-shops-and-shopping-sessions.md), and [0050](0050-inventory-defense-items.md).
