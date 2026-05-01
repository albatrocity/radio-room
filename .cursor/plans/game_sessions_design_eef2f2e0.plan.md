---
name: Game Sessions Design
overview: Design exploration for a global Game Sessions system that plugins can hook into, enabling shared game state with per-user attributes, modifiers, and leaderboards across the plugin ecosystem.
todos:
  - id: define-types
    content: Define GameSession types in @repo/types (GameSession, GameSessionConfig, UserGameState, etc.)
    status: pending
  - id: game-session-service
    content: Create GameSessionService for session lifecycle, state storage, and modifier expiry
    status: pending
  - id: plugin-api
    content: Extend PluginContext with game session API (addScore, applyModifier, etc.)
    status: pending
  - id: system-events
    content: Add GAME_SESSION_* events to SystemEventTypes
    status: pending
  - id: segment-integration
    content: Wire segment activation to auto-start/stop game sessions
    status: pending
  - id: ui-components
    content: Add game-leaderboard and game-attribute component types
    status: pending
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
  name: string           // e.g., "streak"
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
  name: string                          // "Friday Night Battle"
  
  // Which attributes are active in this session
  enabledAttributes: GameStateAttributeName[]
  initialValues: Record<GameStateAttributeName, number>
  
  // Leaderboard configuration
  leaderboards: LeaderboardConfig[]
  
  // Timing
  startsAt?: number                     // Auto-start at timestamp
  endsAt?: number                       // Auto-end at timestamp
  duration?: number                     // Or duration in ms
  
  // Mode
  mode: "individual" | "team"
  teams?: TeamConfig[]
  
  // Segment binding
  segmentId?: string                    // Auto-start/end with segment
}

interface LeaderboardConfig {
  id: string
  attribute: GameStateAttributeName     // "score", "coin", etc.
  sortOrder: "desc" | "asc"
  displayName: string                   // "High Scores"
  showTop?: number                      // Limit display
}
```

### 2.3 Modifier Mechanics

Your spec has modifiers but needs:

```typescript
interface GameStateModifier {
  id: string                            // Unique instance ID
  name: string                          // "double_points", "poisoned"
  source: string                        // Which plugin applied it
  
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
  | { type: "lock"; target: GameStateAttributeName }  // Prevent changes
  | { type: "visible"; value: boolean }               // Hide from leaderboard
  | { type: "flag"; name: string; value: boolean }    // Custom flags
```

### 2.4 Permission Model

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

### 2.5 Plugin API Surface

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

### 2.6 Modifier Tick/Expiry

Who expires modifiers? Options:
1. **Timer in GameSessionService**: Background interval checks expiry
2. **Lazy evaluation**: Check on read, expire on access
3. **Redis TTL**: Use Redis EXPIRE for automatic cleanup

Recommend option 1 for immediate UI updates + option 2 as fallback for accuracy.

### 2.7 Segment Integration

```typescript
// Segment gains new optional field
interface SegmentDTO {
  // ... existing fields
  gameSessionPreset?: GameSessionConfig  // Or reference to a preset
}

// On segment activation (existing SEGMENT_ACTIVATED event):
// 1. If segment.gameSessionPreset exists
// 2. Auto-start a game session with that config
// 3. When segment ends (next segment activates or show ends)
// 4. Auto-end the session and emit results
```

### 2.8 UI Integration

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
```

### 2.9 Persistence and Export

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
    rank: Record<string, number>  // Rank per leaderboard
  }>
  
  // Stats
  totalScoreAwarded: number
  totalCoinsSpent: number
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
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ Plugin A     │ │ Plugin B     │ │ Plugin C     │
    │              │ │              │ │              │
    │ this.game    │ │ this.game    │ │ this.game    │
    │   .addScore()│ │   .addScore()│ │  .applyMod() │
    └──────────────┘ └──────────────┘ └──────────────┘
                            │
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     SystemEvents                             │
    │  GAME_SESSION_STARTED, GAME_STATE_CHANGED, etc.             │
    └─────────────────────────────────────────────────────────────┘
                            │
                            ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                     Frontend                                 │
    │  - Leaderboard components                                   │
    │  - Per-user stat displays                                   │
    │  - Modifier badges/effects                                  │
    └─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

1. **Core infrastructure**: GameSessionService, Redis storage, events
2. **Plugin API**: `this.game.*` methods on BasePlugin
3. **Segment integration**: Auto-start/stop sessions
4. **UI components**: Leaderboard and attribute display
5. **Migrate existing plugins**: Opt-in to use global game state
6. **Store/economy**: Coin spending, modifier purchases
