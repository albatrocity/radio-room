# 0050. Passive Defense Items (Inventory)

**Date:** 2026-05-05  
**Status:** Accepted

## Context

Items in `@repo/types` inventory can affect other users via modifiers (`GameSessionService.applyModifier`) or queue moves (`DJService.moveTrackByPosition`). We need passive items held in inventory that **block** matching incoming harm without an explicit “use” action.

## Decision

1. **`ItemDefinition.defense?: DefenseSpec`** — Declares `scope` (`modifier` | `queue`) and `targeting` (flag names, intents, source plugin, item definition ids, or `blockAllModifiers`). Queue demotion uses intent `negative`; promotion uses `positive`.

2. **`DefenseService`** — Server-only helper: reads the defender’s inventory via `InventoryService`, picks the first matching stack by `acquiredAt`, removes one quantity on block, and emits **`GAME_EFFECT_BLOCKED`** via `SystemEvents`.

3. **Interception points** — `GameSessionService.applyModifier` runs defense before persisting; `DJService.moveTrackByPosition` runs defense after resolving the track owner. Plugin-attributed queue rows (`userId` starting with `plugin:`) skip queue defense.

4. **`ApplyModifierResult`** — `applyModifier` / `applyTimedModifier` return a discriminated result (`ok`, `defense_blocked`, `no_active_session`) so callers (e.g. item behaviors) can surface **“Blocked by &lt;item name&gt;”** without consuming the attacking item.

5. **Actor attribution** — Optional `actorUserId` on `applyModifier` options and `applyTimedModifier`, and on `PluginAPI.moveTrackByPosition`, for event payloads.

## Consequences

- **Positive:** Central rules, no plugin registry hook; aligns with ADR 0042 (core inventory + game session).
- **Negative:** `applyModifier` API is a breaking change for plugins that assumed a `string` id return value; callers must check `ApplyModifierResult`.
- **Matching:** If modifier-level filters pass and there are no per-effect filters, any modifier from that source matches (e.g. block all modifiers from a plugin).
