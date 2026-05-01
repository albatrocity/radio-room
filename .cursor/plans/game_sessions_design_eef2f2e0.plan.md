---
name: Game Sessions Design
overview: Design exploration for a global Game Sessions system that plugins can hook into, enabling shared game state with per-user attributes, modifiers, inventory, and leaderboards across the plugin ecosystem.
todos:
  - id: define-types
    content: Define GameSession types in @repo/types (GameSession, GameSessionConfig, UserGameState, InventoryItem, ItemDefinition, etc.)
    status: completed
  - id: game-session-service
    content: Create GameSessionService for session lifecycle, state storage, and modifier expiry
    status: completed
  - id: inventory-service
    content: Create InventoryService for item storage, definition registry, transfers, and limit enforcement
    status: completed
  - id: plugin-api
    content: Extend PluginContext with game session API (addScore, applyModifier, giveItem, etc.)
    status: completed
  - id: system-events
    content: Add GAME_SESSION_* and INVENTORY_* events to SystemEventTypes
    status: completed
  - id: segment-integration
    content: Wire segment activation to auto-start/stop game sessions
    status: completed
  - id: ui-components
    content: Add game-leaderboard, game-attribute, and inventory component types
    status: completed
isProject: false
---

# Game Sessions Design Exploration

## Current State

Your existing plugins (`guess-the-tune`, `playlist-democracy`, `special-words`) each maintain isolated scoreboards using plugin-namespaced Redis sorted sets (e.g., `plugin:guess-the-tune:room:{roomId}:user-scores`). This works well for plugin-specific scoring but doesn't allow:

- Cross-plugin economies (spend coins earned in one plugin on buffs in another)
- Unified leaderboards across game mechanics
- Shared status effects (e.g., "poisoned" affecting all score gains)

---

## Question 1: Core Attributes vs Plugin-Defined

**Recommendation: Hybrid approach with namespaced attributes**

```typescript
// Core attributes - well-known, cross-plugin readable/writable
// Start minimal, add more as use cases emerge
type CoreAttributeName = "score" | "coin"

// Plugin-defined attributes - namespaced, only writable by owning plugin
// Format: "pluginName:attributeName"
type PluginAttributeName = `${string}:${string}` // e.g., "guess-the-tune:streak"

type GameStateAttributeName = CoreAttributeName | PluginAttributeName
```

**Rationale:**

- **Core attributes** provide discoverability and enable the "store" use case (spend `coin` from any plugin)
- **Namespaced plugin attributes** allow domain-specific mechanics without core changes
- Write permissions: Plugins can write to core attributes AND their own namespace, read everything
- This mirrors how CSS custom properties work (`--plugin-name-value`)

**Registry approach for discoverability:**

```typescript
// Plugins register their attributes at load time
interface PluginAttributeDefinition {
  name: string // e.g., "streak"
  type: "counter" | "gauge" | "flag"
  description: string
  defaultValue: number
}

// BasePlugin gets new method
abstract class BasePlugin {
  protected registerGameAttributes(attrs: PluginAttributeDefinition[]): void
}
```

---

## Question 2: What's Missing from the Design

### 2.1 Session Lifecycle and Events

Your spec defines the state shape but not the lifecycle. Consider:

```typescript
// New system events
GAME_SESSION_STARTED: (data: {
  roomId: string
  sessionId: string
  config: GameSessionConfig
}) => void

GAME_SESSION_ENDED: (data: {
  roomId: string
  sessionId: string
  results: GameSessionResults
}) => void

GAME_STATE_CHANGED: (data: {
  roomId: string
  sessionId: string
  userId: string
  changes: GameStateChange[]  // Delta updates, not full state
}) => void

MODIFIER_APPLIED: (data: {
  roomId: string
  sessionId: string
  userId: string
  modifier: GameStateModifier
}) => void
```

### 2.2 Session Configuration

```typescript
interface GameSessionConfig {
  id: string
  name: string // "Friday Night Battle"

  // Which attributes are active in this session
  enabledAttributes: GameStateAttributeName[]
  initialValues: Record<GameStateAttributeName, number>

  // Leaderboard configuration
  leaderboards: LeaderboardConfig[]

  // Timing
  startsAt?: number // Auto-start at timestamp
  endsAt?: number // Auto-end at timestamp
  duration?: number // Or duration in ms

  // Mode
  mode: "individual" | "team"
  teams?: TeamConfig[]

  // Segment binding
  segmentId?: string // Auto-start/end with segment
}

interface LeaderboardConfig {
  id: string
  attribute: GameStateAttributeName // "score", "coin", etc.
  sortOrder: "desc" | "asc"
  displayName: string // "High Scores"
  showTop?: number // Limit display
}
```

### 2.3 Modifier Mechanics

Your spec has modifiers but needs:

```typescript
interface GameStateModifier {
  id: string // Unique instance ID
  name: string // "double_points", "poisoned"
  source: string // Which plugin applied it

  // Timing (you have startAt/endAt, good)
  startAt: number
  endAt: number

  // Effects
  effects: GameStateEffect[]

  // Stacking rules
  stackBehavior: "replace" | "stack" | "extend"
  maxStacks?: number
}

// Effect types need expansion
type GameStateEffect =
  | { type: "multiplier"; target: GameStateAttributeName; value: number }
  | { type: "additive"; target: GameStateAttributeName; value: number }
  | { type: "set"; target: GameStateAttributeName; value: number }
  | { type: "lock"; target: GameStateAttributeName } // Prevent changes
  | { type: "visible"; value: boolean } // Hide from leaderboard
  | { type: "flag"; name: string; value: boolean } // Custom flags
```

### 2.4 Inventory System

Core provides inventory _storage_ abstraction; plugins register item _definitions_ and handle usage.

**Why core, not a plugin:**

- Cross-plugin items are a feature (Guess the Tune awards potions, Potion Shop provides effects)
- Trading/marketplace needs central authority to mediate ownership
- Unified UI - one inventory panel regardless of item source
- Limit enforcement - session config sets `maxInventorySlots`, core enforces

```typescript
// Item instance stored in user inventory
interface InventoryItem {
  itemId: string // Unique instance ID (uuid)
  definitionId: string // "potion-shop:speed-potion"
  sourcePlugin: string // "potion-shop"
  quantity: number
  acquiredAt: number
  metadata?: Record<string, unknown> // Plugin-specific data
}

interface UserInventory {
  userId: string
  items: InventoryItem[]
  maxSlots: number // Configurable per session
}

// Plugins register item definitions at load time
interface ItemDefinition {
  id: string // "speed-potion" (namespaced as "plugin:speed-potion")
  name: string // "Speed Potion"
  description: string
  icon?: string // Emoji or icon name
  stackable: boolean // Can quantities combine?
  maxStack: number // Max per stack if stackable
  tradeable: boolean // Can be transferred to other users?
  consumable: boolean // Destroyed on use?
  coinValue?: number // Base value for selling
}

// Result of using an item
interface ItemUseResult {
  success: boolean
  consumed: boolean // Should core decrement quantity?
  message?: string // Feedback to user
}
```

**Inventory API for plugins:**

```typescript
interface InventoryAPI {
  // Registration (called in plugin register())
  registerItemDefinition(def: ItemDefinition): void

  // Mutations
  giveItem(
    userId: string,
    definitionId: string,
    quantity?: number,
    metadata?: Record<string, unknown>,
  ): Promise<InventoryItem>
  removeItem(userId: string, itemId: string, quantity?: number): Promise<boolean>
  transferItem(
    fromUserId: string,
    toUserId: string,
    itemId: string,
    quantity?: number,
  ): Promise<boolean>

  // Reads
  getInventory(userId: string): Promise<UserInventory>
  hasItem(userId: string, definitionId: string, minQuantity?: number): Promise<boolean>
  getItemDefinition(definitionId: string): ItemDefinition | null
  getAllItemDefinitions(): ItemDefinition[]

  // Usage (core calls back to owning plugin's onItemUsed handler)
  useItem(userId: string, itemId: string, context?: unknown): Promise<ItemUseResult>
}
```

**Item usage flow:**

```
User clicks "Use" on Speed Potion
           │
           ▼
┌─────────────────────────────────┐
│  Core InventoryService          │
│  1. Validate user owns item     │
│  2. Look up sourcePlugin        │
│  3. Call plugin.onItemUsed()    │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  PotionShopPlugin.onItemUsed()  │
│  - Apply modifier (2x score)    │
│  - Return { consumed: true }    │
└─────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  Core InventoryService          │
│  - If consumed, decrement qty   │
│  - Emit INVENTORY_ITEM_USED     │
└─────────────────────────────────┘
```

**BasePlugin gains item handler:**

```typescript
abstract class BasePlugin {
  // Override to handle item usage for items this plugin defines
  protected async onItemUsed(
    userId: string,
    item: InventoryItem,
    definition: ItemDefinition,
    context?: unknown,
  ): Promise<ItemUseResult> {
    return { success: false, consumed: false, message: "Item not usable" }
  }
}
```

**Inventory events:**

```typescript
INVENTORY_ITEM_ACQUIRED: (data: {
  roomId: string
  sessionId: string
  userId: string
  item: InventoryItem
  source: "plugin" | "trade" | "purchase"
}) => void

INVENTORY_ITEM_USED: (data: {
  roomId: string
  sessionId: string
  userId: string
  item: InventoryItem
  result: ItemUseResult
}) => void

INVENTORY_ITEM_TRANSFERRED: (data: {
  roomId: string
  sessionId: string
  fromUserId: string
  toUserId: string
  item: InventoryItem
  quantity: number
}) => void
```

**Session config for inventory:**

```typescript
interface GameSessionConfig {
  // ... existing fields

  // Inventory settings
  inventoryEnabled: boolean
  maxInventorySlots: number // Default: 20
  allowTrading: boolean // Can users transfer items?
  allowSelling: boolean // Can users sell items for coins?
}
```

### 2.6 Permission Model

```typescript
interface GameSessionPermissions {
  // Who can start/stop sessions
  startSession: "admin" | "deputy" | "any"
  stopSession: "admin" | "deputy" | "creator"

  // Who can modify state directly (vs through plugin actions)
  modifyState: "admin" | "plugin_only"

  // Who can apply modifiers
  applyModifiers: "admin" | "plugin_only"
}
```

### 2.7 Plugin API Surface

```typescript
// New methods on PluginContext.api (or new PluginContext.gameSession)
interface GameSessionAPI {
  // Session lifecycle
  getActiveSession(roomId: string): Promise<GameSession | null>
  startSession(roomId: string, config: GameSessionConfig): Promise<GameSession>
  endSession(roomId: string, sessionId: string): Promise<GameSessionResults>

  // State mutations
  addScore(userId: string, attribute: GameStateAttributeName, amount: number): Promise<void>
  setScore(userId: string, attribute: GameStateAttributeName, value: number): Promise<void>

  // Modifiers
  applyModifier(userId: string, modifier: Omit<GameStateModifier, "id">): Promise<string>
  removeModifier(userId: string, modifierId: string): Promise<void>

  // Reads
  getUserState(userId: string): Promise<UserGameState | null>
  getLeaderboard(leaderboardId: string): Promise<LeaderboardEntry[]>
}
```

### 2.8 Modifier Tick/Expiry

Who expires modifiers? Options:

1. **Timer in GameSessionService**: Background interval checks expiry
2. **Lazy evaluation**: Check on read, expire on access
3. **Redis TTL**: Use Redis EXPIRE for automatic cleanup

Recommend option 1 for immediate UI updates + option 2 as fallback for accuracy.

### 2.9 Segment Integration

```typescript
// Segment gains new optional field
interface SegmentDTO {
  // ... existing fields
  gameSessionPreset?: GameSessionConfig // Or reference to a preset
}

// On segment activation (existing SEGMENT_ACTIVATED event):
// 1. If segment.gameSessionPreset exists
// 2. Auto-start a game session with that config
// 3. When segment ends (next segment activates or show ends)
// 4. Auto-end the session and emit results
```

### 2.10 UI Integration

New component types for plugin schemas:

```typescript
// New component types
| {
    id: string
    type: "game-leaderboard"
    area: "userList" | "nowPlaying"
    leaderboardId: string        // From GameSessionConfig
    showRank: boolean
    maxItems: number
  }
| {
    id: string
    type: "game-attribute"
    area: "userListItem"
    attribute: GameStateAttributeName
    format?: "number" | "currency" | "health-bar"
  }
| {
    id: string
    type: "modifier-badge"
    area: "userListItem"
    modifier: string             // Modifier name
  }
| {
    id: string
    type: "inventory-button"
    area: "userList"
    label: string                // "My Inventory"
    opensModal: string           // Modal component id
  }
| {
    id: string
    type: "inventory-grid"
    area: "modal"                // Only in modals
    showQuantity: boolean
    allowUse: boolean
    allowTrade: boolean
  }
| {
    id: string
    type: "item-badge"
    area: "userListItem"
    definitionId: string         // Show if user has this item
    showQuantity: boolean
  }
```

### 2.11 Persistence and Export

```typescript
interface GameSessionResults {
  sessionId: string
  config: GameSessionConfig
  startedAt: number
  endedAt: number

  // Final state for all participants
  participants: Array<{
    userId: string
    username: string
    finalState: UserGameState
    finalInventory: InventoryItem[]
    rank: Record<string, number> // Rank per leaderboard
  }>

  // Stats
  totalScoreAwarded: number
  totalCoinsSpent: number
  totalItemsAcquired: number
  totalItemsUsed: number
  totalItemsTraded: number
}

// Integration with room export
interface RoomExportData {
  // ... existing
  gameSessions?: GameSessionResults[]
}
```

---

## Question 3: Game Examples for Listening Room

### Immediate Fits (Extend Existing Plugins)

1. **Guess the Tune Battle Royale**
   - Start with 3 health
   - Lose health if track ends without guessing
   - Gain health for correct guesses
   - Last player standing wins bonus coins
   - Modifiers: "hint_revealed" shows first letter, costs coins

2. **Democracy Economy**
   - Earn coins for voting on tracks that stay
   - Spend coins on:
     - "Golden Vote" (counts as 2 votes)
     - "Skip Shield" (your track can't be skipped)
     - "Veto" (force-skip a track)

3. **Special Words Bingo**
   - Session generates a 5x5 bingo card of special words
   - First to complete a line wins
   - Modifiers: "shuffle_card", "steal_word"

4. **Potion Shop Economy** (inventory showcase)
   - Earn coins from other plugins (guessing, voting, special words)
   - Spend coins at the shop on items:
     - "Speed Potion" - 2x score for 60 seconds
     - "Shield Potion" - Block one negative modifier
     - "Hint Scroll" - Reveal first letter in Guess the Tune
     - "Golden Vote" - Your vote counts as 2 in Democracy
   - Items persist in inventory, usable anytime during session
   - Trade items with other users

### New Game Modes

4. **Prediction Market**
   - Bet coins on:
     - "Next track will be by [Artist]"
     - "No one will skip for 3 tracks"
     - "Someone will type [word] in chat"
   - Correct predictions pay out 2x

5. **Musical Chairs**
   - When a track ends, one random player "loses a chair"
   - That player has 30 seconds to queue a track or is eliminated
   - Last DJ standing wins

6. **Tag Team DJ Battle**
   - Two teams, alternating track queues
   - Team whose tracks get more reactions wins the round
   - Modifiers: "crowd_favorite" (1.5x reaction value), "sabotage" (opponent reactions count less)

7. **Treasure Hunt**
   - Hidden "treasure words" in track titles/artists
   - First to queue a track containing a treasure word wins coins
   - Modifiers: "compass" (reveals first letter of treasure word)

8. **Combo Master**
   - Chain reactions: React to multiple tracks in a row for combo multiplier
   - Break someone's combo by typing their name + "combo breaker!"
   - Longest combo at session end wins

9. **Hot Potato Queue**
   - One "hot potato" token circulates
   - When you queue a track, potato passes to you
   - When a track ends, whoever has the potato loses health
   - Can spend coins to pass potato early

10. **Genre Roulette**
    - Session picks a target genre
    - Points for queuing tracks matching the genre
    - Penalties for wrong genre
    - Genre changes every N tracks

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GameSessionService                          │
│  - Session lifecycle management                                 │
│  - State storage (Redis hash per session/user)                  │
│  - Modifier expiry ticker                                       │
│  - Leaderboard computation                                      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │
┌─────────────────────────────────────────────────────────────────┐
│                     InventoryService                            │
│  - Item definition registry                                     │
│  - User inventory storage (Redis)                               │
│  - Transfer mediation                                           │
│  - Limit enforcement                                            │
│  - Item usage callback dispatch                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ Plugin A     │ │ Plugin B     │ │ Plugin C     │
    │ (Potion Shop)│ │ (Guess Tune) │ │ (Democracy)  │
    │              │ │              │ │              │
    │ Registers:   │ │ Awards:      │ │ Awards:      │
    │ - potions    │ │ - potions as │ │ - golden     │
    │ - effects    │ │   prizes     │ │   vote item  │
    │              │ │              │ │              │
    │ this.game    │ │ this.game    │ │ this.game    │
    │  .addScore() │ │  .giveItem() │ │  .addScore() │
    │ this.inventory│ │             │ │              │
    │  .registerItem│ │             │ │              │
    └──────────────┘ └──────────────┘ └──────────────┘
                            │
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     SystemEvents                             │
    │  GAME_SESSION_STARTED, GAME_STATE_CHANGED,                  │
    │  INVENTORY_ITEM_ACQUIRED, INVENTORY_ITEM_USED, etc.         │
    └─────────────────────────────────────────────────────────────┘
                            │
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     Frontend                                 │
    │  - Leaderboard components                                   │
    │  - Per-user stat displays (score, coin)                     │
    │  - Modifier badges/effects                                  │
    │  - Inventory grid modal                                     │
    │  - Item badges on users                                     │
    └─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

1. **Core infrastructure**: GameSessionService, InventoryService, Redis storage, events
2. **Plugin API**: `this.game.*` and `this.inventory.*` methods on BasePlugin
3. **Segment integration**: Auto-start/stop sessions
4. **UI components**: Leaderboard, attribute display, inventory grid
5. **Migrate existing plugins**: Opt-in to use global game state
6. **Store/economy**: Coin spending, item shop, modifier purchases
7. **Trading**: User-to-user item transfers
