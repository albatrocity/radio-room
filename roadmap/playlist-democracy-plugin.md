# Playlist Democracy Plugin Implementation

## Overview

Create a modular "Playlist Democracy" plugin that monitors track reactions and automatically skips tracks that don't meet a configurable threshold. This sets a precedent for future "play modes" as pluggable features.

## Architecture

### New Package: `@repo/plugin-playlist-democracy`

Create a standalone package following the adapter pattern:

- **Location**: `packages/plugin-playlist-democracy/`
- **Exports**: Plugin registration API, types, and lifecycle hooks
- **Dependencies**: Minimal - inject context and adapters

### Plugin Structure

```typescript
interface PlaylistDemocracyConfig {
  enabled: boolean
  reactionType: string // emoji shortcode to count
  timeLimit: number // milliseconds (default: 60000)
  thresholdType: "percentage" | "static"
  thresholdValue: number // 0-100 for percentage, absolute number for static
}

interface PlaylistDemocracyPlugin {
  onTrackChange: (params: OnTrackChangeParams) => Promise<void>
  onReactionAdded: (params: OnReactionParams) => void
  onReactionRemoved: (params: OnReactionParams) => void
  cleanup: (roomId: string) => void
}
```

## Implementation Plan

### Phase 1: Type Definitions and Core Plugin

**File**: `packages/types/Room.ts`

- Add `playlistDemocracy?: PlaylistDemocracyConfig` to `Room` interface
- Add to `StoredRoom` as JSON string field

**File**: `packages/types/Queue.ts`

- Add `skipped?: boolean` field to `QueueItem` to track skipped tracks

**File**: `packages/plugin-playlist-democracy/index.ts`

- Create plugin factory function that accepts `AppContext`
- Implement track monitoring with timeout-based checking
- Store active timers in memory (Map<roomId, NodeJS.Timeout>)

**Core Logic**:

1. When track changes, start a timeout for `config.timeLimit`
2. When timeout fires:
   - Get all listening users: `getRoomOnlineUsers()` filtered by `status === 'listening'`
   - Get reactions for current track: `getReactionsForSubject({ reactTo: { type: 'track', id: trackId } })`
   - Filter reactions by `config.reactionType`
   - Calculate if threshold is met (percentage vs static)
   - If NOT met: call `playbackController.skipToNextTrack()` and mark track as skipped

### Phase 2: Server Integration

**File**: `packages/server/index.ts`

- Import and initialize plugin for rooms with `playlistDemocracy.enabled === true`
- Hook plugin into `handleRoomNowPlayingData()` to call `plugin.onTrackChange()`

**File**: `packages/server/operations/data/playlists.ts`

- Update `addTrackToRoomPlaylist()` to preserve `skipped` field when adding to history

**File**: `packages/server/handlers/reactionsHandlers.ts`

- Call `plugin.onReactionAdded()` when reactions are added
- Call `plugin.onReactionRemoved()` when reactions are removed

**File**: `packages/server/handlers/adminHandlers.ts`

- Support updating `playlistDemocracy` config via `setRoomSettings()`
- Emit system message when enabled/disabled
- Initialize or cleanup plugin when settings change

### Phase 3: Job Management

**File**: `packages/plugin-playlist-democracy/lib/democracyMonitor.ts`

- Create `startMonitoring(roomId, trackId, config)` function
- Create `stopMonitoring(roomId)` function to cleanup timers
- Store timers in a `Map<string, { trackId: string, timeout: NodeJS.Timeout }>`

**Integration**:

- Call `startMonitoring()` from `onTrackChange` hook
- Call `stopMonitoring()` when room is deleted or plugin disabled
- Clear existing timer when new track starts

### Phase 4: System Messages

**File**: `packages/plugin-playlist-democracy/lib/messaging.ts`

- Create `sendDemocracyEnabledMessage()` helper
- Create `sendTrackSkippedMessage()` helper with threshold details
- Use existing `sendMessage()` utility from `@repo/server`

**Message Templates**:

- "Playlist Democracy enabled: Tracks need {X}% {emoji} reactions within {Y} seconds"
- "Track skipped: '{Track Name}' didn't receive enough {emoji} reactions ({got} / {needed})"

### Phase 5: Frontend Types and State

**File**: `apps/web/src/types/Room.ts`

- Add `playlistDemocracy?: PlaylistDemocracyConfig` matching server types

**File**: `apps/web/src/components/RoomSettings/PlaylistDemocracySettings.tsx`

- New component for configuring Playlist Democracy
- Form fields: enabled toggle, reaction type picker, time limit, threshold type/value
- Only visible to room creator (`isAdmin`)

**File**: `apps/web/src/components/RoomSettings/RoomSettings.tsx`

- Import and render `PlaylistDemocracySettings` component
- Pass through `settings.playlistDemocracy` and `onChange` handler

### Phase 6: UI Indicators

**File**: `apps/web/src/components/NowPlaying.tsx`

- Show "Playlist Democracy Active" badge when enabled
- Display countdown timer using `meta.nowPlaying.playedAt + config.timeLimit - Date.now()`
- Show progress indicator: current reactions vs threshold

**File**: `apps/web/src/components/Playlist/PlaylistItem.tsx`

- Add visual indicator (icon or badge) for skipped tracks
- Show "Skipped by Playlist Democracy" tooltip

### Phase 7: Testing

**File**: `packages/plugin-playlist-democracy/index.test.ts`

- Test threshold calculations (percentage and static)
- Test timer lifecycle (start, stop, cleanup)
- Test skip logic and edge cases

**File**: `packages/server/handlers/adminHandlers.test.ts`

- Test enabling/disabling Playlist Democracy
- Test config updates

## Key Technical Decisions

1. **Plugin as Separate Package**: Cleanly isolates the feature, making it easy to disable or extend
2. **Memory-Based Timers**: Simple timeout approach, timer state is ephemeral (recreated on restart)
3. **Listening Status Filter**: Only count users with `status === 'listening'`
4. **Single Check Point**: Evaluate threshold only when timer fires, not continuously
5. **Graceful Degradation**: If plugin fails, regular playback continues unaffected

## Files to Create

- `packages/plugin-playlist-democracy/package.json`
- `packages/plugin-playlist-democracy/index.ts`
- `packages/plugin-playlist-democracy/lib/democracyMonitor.ts`
- `packages/plugin-playlist-democracy/lib/messaging.ts`
- `packages/plugin-playlist-democracy/lib/types.ts`
- `packages/plugin-playlist-democracy/index.test.ts`
- `apps/web/src/components/RoomSettings/PlaylistDemocracySettings.tsx`

## Files to Modify

- `packages/types/Room.ts` - Add config field
- `packages/types/Queue.ts` - Add skipped field
- `packages/server/index.ts` - Initialize plugin
- `packages/server/operations/data/playlists.ts` - Preserve skipped field
- `packages/server/operations/room/handleRoomNowPlayingData.ts` - Hook onTrackChange
- `packages/server/handlers/reactionsHandlers.ts` - Hook reaction events
- `packages/server/handlers/adminHandlers.ts` - Support config updates
- `apps/web/src/types/Room.ts` - Add config field
- `apps/web/src/components/RoomSettings/RoomSettings.tsx` - Add settings UI
- `apps/web/src/components/NowPlaying.tsx` - Add countdown indicator
- `apps/web/src/components/Playlist/PlaylistItem.tsx` - Show skipped indicator
