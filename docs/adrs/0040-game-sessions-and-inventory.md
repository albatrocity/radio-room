# 0040. Game Sessions and Inventory as Core Infrastructure

**Date:** 2026-05-01
**Status:** Accepted

## Context

Existing plugins (`guess-the-tune`, `playlist-democracy`, `special-words`) each maintain their own scoreboards in plugin-namespaced Redis sorted sets. This works for plugin-local scoring but blocks several desired multi-plugin experiences:

- **Cross-plugin economies** — earn coins from `guess-the-tune`, spend them in a hypothetical `potion-shop`.
- **Unified leaderboards** across mechanics (a single "score" attribute that any plugin can contribute to).
- **Status effects** that affect score gains regardless of which plugin awards them (e.g. a "double points" modifier).
- **Bound-to-segment games** — auto-start a contest when a scheduled segment activates, end it when the segment ends.
- **Cross-plugin items** — a plugin can award an item defined by another plugin (e.g. Guess the Tune awarding a Speed Potion that Potion Shop knows how to consume).

We considered three placements:

1. **Each plugin keeps its own state.** Status quo. Forces deep plugin-to-plugin coupling for cross-plugin features.
2. **A "core game state" plugin.** Some plugins would depend on it being installed; ordering / load races become tricky; trading needs a single mediator anyway.
3. **Core service.** The system already has core services (`RoomService`, `MessageService`, etc.) and dependency injection via `AppContext` (ADR 0011). Game state and inventory fit the same pattern.

We chose (3): expose two new core services on `AppContext` (`gameSessions`, `inventory`) and surface plugin-facing views (`PluginContext.game`, `PluginContext.inventory`).

## Decision

### Game Sessions are core infrastructure

`GameSessionService` manages session lifecycle, per-user state, modifiers, and leaderboards.

- **Attribute namespacing:** core attributes are `score` and `coin` (cross-plugin readable AND writable). Plugins may also write attributes namespaced as `<pluginName>:<key>` (e.g. `"guess-the-tune:streak"`). Reads are unrestricted across all attributes. Plugin-defined attribute *definitions* are registered via `context.game.registerAttributes()` for UI discoverability.
- **One active session per room.** Starting a new session ends any active one and emits `GAME_SESSION_ENDED` with results.
- **Modifier expiry:** option (1) + (2) from the design plan — a periodic ticker (1s) scans active sessions and emits `GAME_MODIFIER_REMOVED` for expired modifiers; reads also lazy-prune expired modifiers for accuracy if a tick is missed.
- **Leaderboards:** stored as Redis ZSETs keyed by `LeaderboardConfig.id`. Hydrated with usernames on read.
- **Segment integration:** `SegmentDTO.gameSessionPreset` (optional). On segment activation, any previously-active session is ended; a new session is started if the new segment has a preset. This binds session lifetime to segment lifetime without requiring plugins to subscribe to `SEGMENT_ACTIVATED` themselves.

### Inventory is core infrastructure (not a plugin)

`InventoryService` manages item *storage*; plugins register item *definitions* and implement `onItemUsed` to resolve effects.

- **Cross-plugin items work out of the box.** Plugin A awards an item defined by plugin B; clicking "use" routes back to plugin B's `onItemUsed` automatically.
- **Single trade authority.** `transferItem` is mediated by core, honouring `ItemDefinition.tradeable` and `GameSessionConfig.allowTrading`.
- **Limit enforcement is uniform.** `GameSessionConfig.maxInventorySlots` is enforced by core, so plugins don't reinvent slot logic.
- **Storage layout:** items stored as `room:{roomId}:inventory:items:{userId}` HASH (`itemId` -> JSON `InventoryItem`); definitions stored as `room:{roomId}:inventory:definitions` HASH.

### Plugin API surface

Plugins receive two new typed APIs alongside the existing `api`, `storage`, and `lifecycle`:

- `context.game: GameSessionPluginAPI` — `addScore`, `setScore`, `applyModifier`, `getLeaderboard`, etc. The plugin name is automatically used as `source` on modifiers and `reason` defaults.
- `context.inventory: InventoryPluginAPI` — `registerItemDefinitions`, `giveItem`, `transferItem`, `useItem`, `getInventory`, etc. Item ids are automatically namespaced as `<pluginName>:<shortId>`.

`BasePlugin` exposes `this.game` / `this.inventory` getters and a default `onItemUsed` that returns "not handled" so plugins which don't define items pay no cost.

### New system events (route through `SystemEvents` per ADR 0008)

- `GAME_SESSION_STARTED`, `GAME_SESSION_ENDED`
- `GAME_STATE_CHANGED` (delta-based; carries `GameStateChange[]`)
- `GAME_MODIFIER_APPLIED`, `GAME_MODIFIER_REMOVED`
- `INVENTORY_ITEM_ACQUIRED`, `INVENTORY_ITEM_USED`, `INVENTORY_ITEM_REMOVED`, `INVENTORY_ITEM_TRANSFERRED`

### New declarative UI components

`game-leaderboard`, `game-attribute`, `modifier-badge`, `inventory-button`, `inventory-grid`, `item-badge`. Plugins reference them via the existing `PluginComponentDefinition` discriminated union; frontends implement them once per app.

## Consequences

### Positive

- **No plugin-to-plugin coupling for shared state.** A new "Potion Shop" plugin can award speed potions and resolve effects without other plugins importing it.
- **Unified frontend rendering.** One `inventory-grid`, one `game-leaderboard` — no plugin-specific React.
- **Segment-bound games are declarative.** Adding `gameSessionPreset` to a segment is enough to spawn a session.
- **Modifier mechanics are uniform.** Multipliers and additives compose predictably; locks prevent score changes; flags expose plugin-specific booleans.
- **Stateless across restarts.** All session/inventory state lives in Redis; the modifier ticker is the only in-memory thing and it just scans Redis on each tick.

### Negative / trade-offs

- **More core surface area.** `AppContext` grows two services and `PluginContext` grows two API objects. Mitigated by both being optional at runtime (services are nullable and APIs no-op cleanly).
- **Coin/score economy invariants live in plugins.** The core does not police coin spending; if a plugin awards 1000 coins for one event, that's a plugin-level decision. Acceptable given the existing trust model for in-process plugins.
- **Cross-plugin item definitions need agreement on shape.** `ItemDefinition.metadata` is opaque, but plugins consuming items defined elsewhere need to know what fields to expect. Documented per-item in plugin READMEs.
- **Modifier ticker overhead.** O(rooms × users × modifiers) per tick. With a 1s interval and small-to-medium rooms, this is negligible; can be moved to a per-session expiry index if profiling shows otherwise.

### Migration path for existing plugins

Existing plugins keep their isolated scoreboards; opting into the global `score` attribute is a one-line change (`this.game.addScore(userId, "score", n)` instead of `this.context.storage.zincrby(...)`). No big-bang migration is required.
