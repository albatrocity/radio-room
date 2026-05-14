# 0053. Defense-triggered callbacks (`onDefenseTriggered`)

**Date:** 2026-05-11  
**Status:** Accepted

## Context

ADR [0050](0050-inventory-defense-items.md) added passive defense for **modifiers** and **queue** moves: core matches targeting, **consumes** one quantity from the defender’s stack, and emits **`GAME_EFFECT_BLOCKED`**.

Some defense items need **extra behavior** after that consume — e.g. **P2P File Sharing**: award the defender a copy of the attacker’s item definition. That logic must stay with the **item definition** (plugin item module), not in core inventory or defense matching.

We briefly considered a separate **`DefenseScope` value `"itemUse"`** and an **`InventoryService.useItem` intercept** before `onItemUsed`. That duplicated the modifier-defense path for every `requiresTarget: "user"` item today (they all apply modifiers via `applyTimedModifier`). We **rejected** a separate scope: **P2P File Sharing uses `scope: ["modifier"]`** and the same `sourcePlugins` / `modifierMatchesTargeting` rules as other modifier defenses.

## Decision

1. **No `itemUse` scope** — `DefenseScope` remains `"modifier" | "queue"` only (`@repo/types` / `Inventory.ts`).

2. **`DefenseService.checkModifierDefense` / `checkQueueDefense`** — After a matching stack is **consumed**, core loads the defense `ItemDefinition` and calls **`PluginRegistry.invokeOnDefenseTriggered(roomId, defenseDef.sourcePlugin, payload)`**. The callback is **best-effort**: defense is already spent; return `null` for default messaging, or `{ attackerMessage?, roomMessage? }` to override attacker-facing copy and/or the room **`MESSAGE_RECEIVED`** line.

3. **`DefenseTriggeredPayload` / `DefenseTriggeredResult`** — In `@repo/types` (`Inventory.ts`). Payload includes `roomId`, `defenderUserId`, optional `attackerUserId`, optional `attackerItemDefinition` (when the blocked modifier carried `itemDefinitionId`), optional **`blockedModifier`** (the modifier that would have been applied, for **modifier** blocks only), and `defenseItemDefinition`. Result fields are **optional** overrides only (no `success` flag).

4. **`RoomPlugin.onDefenseTriggered`** — Optional on `Plugin` (`Plugin.ts`); **`PluginRegistry.invokeOnDefenseTriggered`** mirrors `invokeOnItemUsed`.

5. **Item shops** — Optional **`onDefenseTriggered`** per `Item` (`createItem` in `items/shared/types.ts`), map **`ITEM_DEFENSE_TRIGGERED_BEHAVIORS`** (`items/index.ts`). The item-shops plugin routes by `payload.defenseItemDefinition.shortId`.

6. **`GameSessionService.applyModifier`** — Passes **`actorUserId`** into `checkModifierDefense`. An internal `skipPassiveDefenseCheck` flag (not exposed on the public plugin API) is set when re-applying a bounced modifier so passive defense does not recurse; plugins reach this path only via **`GameSessionPluginAPI.reboundModifier(userId, modifier, options?)`**. On `defense_blocked`, returns **`ApplyModifierResult`** with optional **`attackerMessage`** from the callback so item handlers (e.g. `applyTargetedTimedModifier`) can show custom copy while still using **`consumed: true`**.

7. **`DJService.moveTrackByPosition`** — Passes **`actorUserId`** into `checkQueueDefense`; optional **`attackerMessage`** on **`MoveTrackResult`** when blocked.

8. **`GAME_EFFECT_BLOCKED`** — `blockType` is **`"modifier"` | `"queue"`** only; no separate `item_use` branch. Intercepted item identity remains on **`modifier.itemDefinitionId`** when present.

## Consequences

- **Positive:** One defense pipeline; `DefenseTargeting.sourcePlugins` always filters **`GameStateModifier.source`**. Item authors co-locate `defense`, `use`, and `onDefenseTriggered` in one file.
- **Negative:** A future **`requiresTarget: "user"`** item that does **not** go through `applyModifier` / `applyTimedModifier` would not trigger modifier defense automatically; that item’s plugin would need to call defense explicitly or apply a modifier-shaped hook for consistency.

**Example items:** **P2P File Sharing** (`shortId: "p2p-file-sharing"`) — `scope: ["modifier"]`, `targeting: { sourcePlugins: ["item-shops"] }`, **`onDefenseTriggered`** calls `giveItem(defender, attackerItemDefinition.id, …, "defense_intercept")` and returns custom **`attackerMessage` / `roomMessage`**. **Rubber Band** (`shortId: "rubber-band"`) — same defense shape; **`onDefenseTriggered`** redirects **`payload.blockedModifier`** onto **`attackerUserId`** via **`game.reboundModifier(attackerUserId, blockedModifier)`**.
