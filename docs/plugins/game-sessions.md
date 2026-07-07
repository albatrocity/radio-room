# Game Sessions & Inventory


Listening Room provides **core infrastructure** for cross-plugin game state so plugins can share `score` / `coin`, timed modifiers, configurable leaderboards, and a single inventory per user—without each plugin rolling its own Redis keys.

**Architecture:** See [ADR 0042: Game Sessions and Inventory](../adrs/0042-game-sessions-and-inventory.md).

### When to use what

| Approach                                     | Use when                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **`this.context.storage`** (`zincrby`, etc.) | Scoreboards or state that should stay **isolated** to your plugin (current behaviour for Guess the Tune, etc.).                           |
| **`this.game` / `this.inventory`**           | **Shared** economy (`coin`), unified leaderboards, buffs/debuffs that affect multiple plugins, items another plugin can award or consume. |

Access APIs via **`this.game`** and **`this.inventory`** on `BasePlugin` (aliases for `this.context!.game` / `this.context!.inventory`). They are room-scoped: you never pass `roomId`; the server ties calls to the plugin’s room.

If `GameSessionService` is not running (should not happen in production), methods no-op or return empty values safely.

### Attributes

- **Core attributes** — `score` and `coin`. Any plugin may read and write them (cross-plugin economy).
- **Plugin attributes** — Namespaced as `"<plugin-name>:<key>"` (e.g. `"guess-the-tune:streak"`). Convention: only the **owning** plugin writes its namespace; everyone may read.

Register metadata for your custom attributes so UIs can discover them:

```typescript
await super.register(context)

this.game.registerAttributes([
  {
    name: "streak",
    type: "counter",
    description: "Correct guesses in a row",
    defaultValue: 0,
    label: "Streak",
  },
])
```

### Game session API (`this.game`)

| Method                                                           | Description                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getActiveSession()`                                             | Current `GameSession` or `null`.                                                                                                                                                                                                                                                                                                      |
| `startSession(config)`                                           | Starts a session; ends any existing active session for the room. Pass at least `{ name: string }`; other fields get defaults (`enabledAttributes`, leaderboards, inventory flags, etc.).                                                                                                                                              |
| `endSession()`                                                   | Ends the active session; returns `GameSessionResults` or `null`.                                                                                                                                                                                                                                                                      |
| `registerAttributes(defs)`                                       | Registers `PluginAttributeDefinition[]` (fire-and-forget).                                                                                                                                                                                                                                                                            |
| `addScore(userId, attribute, amount, reason?)`                   | Adds to an attribute; applies active **multiplier** / **additive** modifiers; returns new value. **Lock** effects block changes.                                                                                                                                                                                                      |
| `setScore(userId, attribute, value, reason?)`                    | Sets absolute value (ignores multiplier/additive on that write path).                                                                                                                                                                                                                                                                 |
| `applyModifier(userId, modifier, options?)`                      | Returns `ApplyModifierResult`: on success `{ ok: true, modifierId }`; on failure `{ ok: false, reason: "no_active_session" \| "defense_blocked", blockingItemName?, attackerMessage? }`. Optional `options.actorUserId` attributes the initiator for defense events and `onDefenseTriggered`. Omit `id` and `source` from `modifier`. |
| `applyTimedModifier(userId, durationMs, modifier, actorUserId?)` | Same as `applyModifier`, but sets `startAt = Date.now()` and `endAt = startAt + durationMs`. Optional `actorUserId` is forwarded as `applyModifier`’s `actorUserId`.                                                                                                                                                                  |
| `reboundModifier(userId, modifier, options?)`                    | Re-apply a modifier (typically `DefenseTriggeredPayload.blockedModifier`) to another user, **bypassing passive modifier defense**. Recomputes `startAt`/`endAt` from `Date.now()` + the modifier's original duration. Intended for defense items that redirect incoming effects (e.g. Rubber Band).                                   |
| `removeModifier(userId, modifierId)`                             | Removes one modifier instance.                                                                                                                                                                                                                                                                                                        |
| `getUserState(userId)`                                           | Full `UserGameState` or `null` if no active session.                                                                                                                                                                                                                                                                                  |
| `getLeaderboard(leaderboardId)`                                  | Hydrated rows (`GameLeaderboardEntry[]`) for a `LeaderboardConfig.id`.                                                                                                                                                                                                                                                                |

**Modifiers** support `stackBehavior`: `"replace"` | `"stack"` | `"extend"`, plus optional `maxStacks`. Effects include `multiplier`, `additive`, `set`, `lock`, and `flag` on targets — see `@repo/types` (`GameStateModifier`, `GameStateEffect`, `GameStateEffectWithMeta`). Per-effect metadata may include optional **`icon`** (e.g. Lucide name for UIs) and **`intent`** (`"positive"` \| `"negative"` \| `"neutral"`) for styling (e.g. modifier lists).

### Inventory API (`this.inventory`)

Items are **defined** by plugins and **stored** by core so any plugin can `giveItem` using another plugin’s `definitionId`.

Optional **`defense`** on `ItemDefinition` enables **passive** blocking of matching modifiers or queue moves while the item is held; each block removes one from stack `quantity` (see `DefenseScope`, `DefenseSpec` in `@repo/types`).

Register definitions in `register()` (ids are built as `"<your-plugin-name>:<shortId>"`):

```typescript
this.inventory.registerItemDefinitions([
  {
    shortId: "speed-potion",
    name: "Speed Potion",
    description: "2× score for 60 seconds",
    stackable: true,
    maxStack: 99,
    tradeable: true,
    consumable: true,
    coinValue: 10,
  },
])
```

| Method                                                          | Description                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `registerItemDefinitions(defs)`                                 | One or more definitions without `id` / `sourcePlugin` (set automatically).                             |
| `giveItem(userId, definitionId, quantity?, metadata?, source?)` | Awards items; respects stacking, slot limits, session config.                                          |
| `removeItem(userId, itemId, quantity?)`                         | Removes quantity from a stack.                                                                         |
| `transferItem(fromUserId, toUserId, itemId, quantity?)`         | Only if `ItemDefinition.tradeable` and the active session allows trading.                              |
| `useItem(userId, itemId, context?)`                             | Validates ownership, calls the **defining** plugin’s `onItemUsed`, may decrement if result `consumed`. |
| `getInventory(userId)`                                          | `UserInventory` (items + `maxSlots`).                                                                  |
| `hasItem(userId, definitionId, minQuantity?)`                   | Convenience check.                                                                                     |
| `getItemDefinition(definitionId)`                               | Async lookup.                                                                                          |
| `getAllItemDefinitions()`                                       | All definitions registered for the room.                                                               |

### User personas (`this.personas`)

See [User Personas](user-personas.md) for the full API. Personas are identity labels (VIP, Judge, etc.) — distinct from gameplay modifiers.

### Defense items (passive interception)

Defense items are **held-passive** inventory definitions. They are not "used" to activate; they trigger automatically when a matching incoming action targets the holder (or a track they queued, for queue defenses).

Add a `defense` block on `ItemDefinition`:

```typescript
this.inventory.registerItemDefinitions([
  {
    shortId: "queue-anchor",
    name: "Queue Anchor",
    description: "Blocks one negative queue move against a track you queued.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: false, // passive item, not actively used
    coinValue: 75,
    defense: {
      scope: ["queue"],
      targeting: { intents: ["negative"] }, // demotion
    },
  },
])
```

#### Defense matching model

- **Scope first**:
  - `scope: ["modifier"]` protects against `this.game.applyModifier` / `applyTimedModifier`.
  - `scope: ["queue"]` protects against queue moves (`moveTrackByPosition`).
- **Queue intent mapping**:
  - `delta > 0` (demotion) => `intent: "negative"`
  - `delta < 0` (promotion) => `intent: "positive"`
- **Modifier matching is whole-modifier**:
  - If any effect in the incoming modifier matches your per-effect filters (`intents`, `flagNames`), the **entire modifier is blocked**.
- **Source filters**:
  - `sourcePlugins`: matches `GameStateModifier.source` (the plugin applying it).
  - `sourceItemDefinitionIds`: matches `GameStateModifier.itemDefinitionId`.
- **Priority**:
  - When multiple held defenses match, the server consumes the first by `acquiredAt` (oldest matching stack first).
- **Consumption**:
  - One successful block removes `quantity` by 1 from the matching stack.
  - This is independent of `consumable`; `consumable` controls active `useItem` behavior, not passive trigger behavior.

#### What plugins receive when blocked

`this.game.applyModifier(...)` and `this.game.applyTimedModifier(...)` return `ApplyModifierResult`:

```typescript
const applied = await this.game.applyTimedModifier(targetUserId, 60_000, {
  name: "compressor",
  effects: [{ type: "flag", name: "shrink", value: true, intent: "negative" }],
  stackBehavior: "stack",
})

if (!applied.ok) {
  if (applied.reason === "defense_blocked") {
    return { success: false, consumed: false, message: `Blocked by ${applied.blockingItemName}` }
  }
  return { success: false, consumed: false, message: "No active session." }
}
```

For queue actions, `PluginAPI.moveTrackByPosition(...)` returns `MoveTrackResult`: on success `{ success: true }`; on failure `{ success: false, reason: "error", message }` or, when a passive defense item blocks the move, `{ success: false, reason: "defense_blocked", blockingItemName, attackerMessage? }`. Item handlers should treat `defense_blocked` like modifier defense (typically consume the attacking item and message the user).

#### Actor attribution

When the initiating user matters (for audits / event payloads), pass the actor:

- `this.game.applyModifier(userId, modifier, { actorUserId })`
- `this.game.applyTimedModifier(userId, durationMs, modifier, actorUserId)`
- `this.game.reboundModifier(attackerUserId, blockedModifier, { actorUserId })` — only inside `onDefenseTriggered`, to redirect an incoming effect to the attacker without re-triggering passive defense.
- `this.context.api.moveTrackByPosition(roomId, metadataTrackId, delta, actorUserId)`

For item-triggered effects, this should be the **user using the item** (not the plugin name).

#### Event: `GAME_EFFECT_BLOCKED`

When a defense triggers, the server emits `GAME_EFFECT_BLOCKED` via `SystemEvents` (plugins can subscribe with `this.on("GAME_EFFECT_BLOCKED", ...)`).

Payload summary:

- `roomId`, `sessionId`
- `targetUserId` (the defended target)
- `actorUserId?` (initiator, when known)
- `blockType`: `"modifier"` or `"queue"`
- `modifier?` (for modifier blocks; includes `itemDefinitionId` when the attacking item set it)
- `queue?` (`metadataTrackId`, `delta`, `intent`) for queue blocks
- `blockedBy` (`itemDefinitionId`, `itemId`, `defenderUserId`, `itemName`)

### Handling defense triggers (`onDefenseTriggered`)

Optional. After **`DefenseService`** matches and **consumes** one quantity from a passive defense (`modifier` or `queue` scope), core calls **`onDefenseTriggered(payload)`** on the plugin that **owns the defense item**. For modifier blocks, **`payload.blockedModifier`** carries the modifier that would have been applied (no `id` / `source`). Return **`null`** for default messaging and no extra side effects. Return **`{ attackerMessage?, roomMessage? }`** to override the attacker-facing line (surfaced on `ApplyModifierResult` / `MoveTrackResult` when applicable) and/or the room **`MESSAGE_RECEIVED`** line after a block. Item shops route by `payload.defenseItemDefinition.shortId` via per-item handlers (see ADR 0053). Examples: **P2P File Sharing** — `scope: ["modifier"]`, `onDefenseTriggered` awards a copy via `giveItem(..., "defense_intercept")`; **Rubber Band** — redirects `blockedModifier` onto `attackerUserId` via `this.game.reboundModifier(attackerUserId, blockedModifier)`.

### Handling item use (`onItemUsed`)

Override on your plugin class when you register consumables or usable items. The server routes `useItem` to the plugin that **owns** the item definition.

```typescript
async onItemUsed(
  userId: string,
  item: InventoryItem,
  definition: ItemDefinition,
  _context?: unknown,
): Promise<ItemUseResult> {
  if (definition.shortId === "speed-potion") {
    const result = await this.game.applyTimedModifier(userId, 60_000, {
      name: "speed_boost",
      effects: [{ type: "multiplier", target: "score", value: 2 }],
      stackBehavior: "extend",
    })
    if (!result.ok) {
      if (result.reason === "defense_blocked") {
        return {
          success: false,
          consumed: false,
          message: `Blocked by ${result.blockingItemName}`,
        }
      }
      return { success: false, consumed: false, message: "No active session." }
    }
    return { success: true, consumed: true, message: "Speed boost!" }
  }
  return { success: false, consumed: false, message: "Unknown item" }
}
```

`BasePlugin` provides a default implementation that returns “not handled”; override only when you define items.

For **`effects` of type `"flag"`**, derive booleans with **`getActiveFlags(userState.modifiers, Date.now())`** from **`@repo/game-logic`** (see [ADR 0046](../adrs/0046-derived-modifier-flags.md)). For items with **`requiresTarget: "user"`**, the socket passes **`callContext`** as **`{ targetUserId?: string }`** — validate the user is still in the room before applying effects to them.

Item Shops items that post room **`sendSystemMessage`** lines naming the actor should use **`resolveItemUseActorDisplayName`** (see [Item Shops development](../SHOP_ITEM_DEVELOPMENT.md)) so the **`anonymous_actions`** flag (Ski Mask) hides the username in that copy. Other plugins can reuse the same pattern with `getUserState` + **`hasAnonymousActions`** / **`ANONYMOUS_ACTIONS_FLAG`** from **`@repo/game-logic`** / **`@repo/plugin-base`**.

### Handling item sell-back (`onItemSold`)

When a user sells an item from their inventory (via the built-in **Inventory** tab in the User Game State modal, which emits `SELL_INVENTORY_ITEM`), the server routes the sale to the plugin that owns the item definition through `onItemSold`. The plugin is responsible for the full sale: removing the item from inventory, refunding coins, restocking, and emitting any UI updates.

When implementing a shop, prefer the [`ShopHelper`](shop-helper.md#shop-helper) (or extend [`ShopPlugin`](shop-helper.md#shop-helper)) rather than rolling this logic by hand.

```typescript
async onItemSold(
  userId: string,
  item: InventoryItem,
  definition: ItemDefinition,
): Promise<ItemSellResult> {
  const config = await this.getConfig()
  return this.shop.sell({ userId }, item.itemId, { basePrice: config.skipTokenPrice })
}
```

If a plugin defines tradeable items but doesn't implement `onItemSold`, attempting to sell those items returns "this item can't be sold" to the client.

### System events (subscribe via `this.on`)

Emitters use `SystemEvents` (same pipeline as other domain events). Useful payloads:

| Event                        | When                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| `GAME_SESSION_STARTED`       | `{ roomId, sessionId, config }`                                   |
| `GAME_SESSION_ENDED`         | `{ roomId, sessionId, results }`                                  |
| `GAME_STATE_CHANGED`         | `{ roomId, sessionId, userId, changes }` — attribute deltas       |
| `GAME_MODIFIER_APPLIED`      | Modifier applied or extended                                      |
| `GAME_MODIFIER_REMOVED`      | Expired or manually removed                                       |
| `INVENTORY_ITEM_ACQUIRED`    | Item given (source: `plugin` \| `trade` \| `purchase` \| `admin`) |
| `INVENTORY_ITEM_USED`        | After `useItem` completes                                         |
| `INVENTORY_ITEM_REMOVED`     | Partial/full stack removal                                        |
| `INVENTORY_ITEM_TRANSFERRED` | Player-to-player transfer                                         |

### Segment-bound sessions (scheduling)

If a show segment includes **`gameSessionPreset`** on `SegmentDTO`, activating that segment **ends** any prior game session for the room and **starts** a new one from the preset (when preset apply mode is not `"skip"`). Presets are partial configs plus a required `name`; optional `segmentId` is filled at activation.

This ties session lifetime to segment changes without extra plugin code.

### UI components (declarative)

Add these to `getComponentSchema()` like other template-backed components. Types live in `@repo/types` (`PluginComponentDefinition`).

| Type               | Typical area             | Purpose                                             |
| ------------------ | ------------------------ | --------------------------------------------------- |
| `game-leaderboard` | `userList`, `nowPlaying` | Ranks by `leaderboardId` from active session config |
| `game-attribute`   | `userListItem`           | Single attribute (`score`, `coin`, or namespaced)   |
| `modifier-badge`   | `userListItem`           | Show when a named modifier is active                |
| `inventory-button` | `userList`               | Opens a modal (`opensModal`)                        |
| `inventory-grid`   | Inside a `modal`         | Grid with optional use/trade                        |
| `item-badge`       | `userListItem`           | Badge when user owns `definitionId`                 |

Frontends must implement these template names alongside existing ones (`leaderboard`, `badge`, etc.). Until implemented, they may no-op.

### Session configuration snapshot

`GameSessionConfig` includes `enabledAttributes`, `initialValues`, `leaderboards`, timing (`startsAt` / `endsAt` / `duration`), `mode` (`individual` \| `team`), optional `teams`, `segmentId`, and inventory flags: `inventoryEnabled`, `maxInventorySlots`, `allowTrading`, `allowSelling`.

---
