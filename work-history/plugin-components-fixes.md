# Plugin Components Fixes - Playlist Democracy

## Issues Fixed

### Issue 1: Track Not Skipping ✅

**Root Cause**: Timer logic was intact, but component state updates were incorrectly trying to use non-existent `updateComponentState` method.

**Fix**: Removed all `updateComponentState()` calls. The countdown component manages its own state via XState timer machine - it doesn't need pushed updates.

### Issue 2: Countdown Starting at Page Load ✅

**Root Cause**: `getComponentState()` was returning `Date.now()` as fallback when no track was playing, causing the countdown to start from page load time.

**Fix**:

- Return `null` for `trackStartTime` when no track is playing
- Added null check in `CountdownTemplateComponent` to not render when `trackStartTime` is null
- Fixed `getComponentState()` signature to not take `roomId` parameter (uses `this.context.roomId` instead)

### Issue 3: All Playlist Items Showing Skip Text ✅

**Root Cause**: Used plugin components for per-track data. Plugin component store is global per room, not per-track.

**Fix**: Moved skip info to playlist augmentation system (`augmentPlaylistTrack`), which is called per-track:

```typescript
async augmentPlaylistTrack(track: QueueItem): Promise<PluginAugmentationData | undefined> {
  const skipDataStr = await this.context.storage.get(`skipped:${track.mediaSource.trackId}`)
  if (!skipDataStr) return undefined

  const skipData = JSON.parse(skipDataStr)
  return {
    skipped: true,
    skipData: {
      voteCount: skipData.voteCount,
      requiredCount: skipData.requiredCount,
    },
  }
}
```

The existing `PlaylistItem.tsx` component already handles `pluginData` from augmentation.

## Architecture Clarifications

### When to Use Plugin Components

✅ **Good for:**

- **Room-level data**: Countdown timers, total counts, current state
- **Real-time updates**: Data that changes frequently and is broadcast to all users
- **Global UI elements**: Components that appear once (now playing area, user list header)

❌ **Bad for:**

- **Per-item data**: Playlist track info, user-specific data
- **Historical data**: Past events, cached results
- **One-off lookups**: Data that's different for each rendered item

### When to Use Playlist Augmentation

✅ **Good for:**

- **Per-track metadata**: Skip status, vote counts, custom flags
- **Batch operations**: Fetching data for many items at once
- **Read-time data**: Information determined when playlist is fetched

### Component State vs Storage

**Plugin Component Store** (`storeKeys`):

- Ephemeral, in-memory on frontend
- Fetched once on mount via `getComponentState()`
- Updated via plugin events (future feature)
- Used by components for reactive rendering

**Plugin Storage** (`this.context.storage`):

- Persisted in Redis with automatic namespacing
- Used for durable data (votes, skip history, leaderboards)
- Accessed by backend only

## Code Changes

### Simplified Plugin

**Removed:**

- `updateComponentState()` calls (doesn't exist)
- Vote count/required count from component state (not needed for countdown)
- `roomId` parameter from `getComponentState()`

**Added:**

- `augmentPlaylistTrack()` for per-track skip info
- `calculateRequiredVotes()` helper method
- Null safety for `trackStartTime`

**Kept:**

- Timer setup logic (still works correctly)
- Skip checking logic (`checkThresholdAndSkip`)
- Storage of skip data for augmentation

### Component State Schema

Before:

```typescript
storeKeys: ["trackStartTime", "voteCount", "requiredCount", "isSkipped"]
```

After:

```typescript
storeKeys: ["trackStartTime"] // Only what countdown needs
```

### Frontend Component

Added null check:

```typescript
function CountdownTemplateComponent({ startKey, ... }) {
  const startValue = store[startKey]

  // Don't render if no valid start time
  if (startValue === null || startValue === undefined) {
    return null
  }

  // ... rest of component
}
```

## Hardcoded UI Successfully Removed

The plugin component system now fully replaces the hardcoded countdown UI:

**Removed from Frontend:**

- `timerEnabled` logic in `NowPlaying/index.tsx`
- `timerSettings` prop passing
- `settingsMachine` dependency
- Hardcoded `<CountdownTimerProvider>` and `<NowPlayingVoteCountdown>` JSX

**Plugin System Handles:**

- Countdown rendered via `PluginArea area="nowPlaying"`
- Configuration accessed via `config.timeLimit` and `config.reactionType`
- State managed via `getComponentState()` returning `trackStartTime`
- Visibility controlled via `enabledWhen: "enabled"`

**Result:** Zero plugin-specific React components in the frontend! 🎉

## Additional Fixes

### Issue: Timer Not Restarting

**Problem:** `getComponentState()` only called once on mount. When track changes, timer stayed at 0.

**Root Cause:** Components were subscribing to custom plugin events (e.g., `TRACK_STARTED`), but the `pluginComponentMachine` only listened for namespaced events like `PLUGIN:playlist-democracy:TRACK_STARTED`. Subscriptions didn't match actual event names.

**Solution: Plugin Re-emits System Events**

After considering two approaches, we chose the cleaner architecture:

**Event Flow:**

```
System Event (TRACK_CHANGED)
  ↓
Plugin Handler (onTrackChanged) listens via this.on("TRACK_CHANGED", ...)
  ↓
Plugin transforms data (track.playedAt → trackStartTime)
  ↓
Plugin emits: await this.emit("TRACK_STARTED", { trackStartTime: ... })
  ↓
Socket broadcasts: PLUGIN:playlist-democracy:TRACK_STARTED
  ↓
pluginComponentMachine receives and updates store
  ↓
Component re-renders
```

**Benefits:**

- ✅ **Single source of truth**: Component updates only from `PLUGIN:*` events
- ✅ **Easy debugging**: All component updates visible in plugin's `emit()` calls
- ✅ **Plugin control**: Full control over data transformation
- ✅ **Simple machine**: No special-case logic for different event types
- ✅ **Discoverable**: Plugin authors see exactly what's sent to components

**Implementation:**

1. **Plugin listens** to system event: `this.on("TRACK_CHANGED", this.onTrackChanged.bind(this))`
2. **Plugin transforms** data in handler: Extract `track.playedAt` from system event
3. **Plugin emits** for components: `await this.emit("TRACK_STARTED", { trackStartTime })`
4. **Machine receives** namespaced event: `PLUGIN:playlist-democracy:TRACK_STARTED`
5. **Component updates** with new `trackStartTime`

### Issue: Plugin Broken After Disable/Re-enable

**Problem:** When plugin disabled and re-enabled, countdown wouldn't work until server restart.

**Solution:**

1. When plugin enabled in `onConfigChanged()`:
   - Check if track is currently playing
   - Calculate remaining time window
   - Start monitoring if within window
   - Set timer for remaining duration
2. When plugin disabled:
   - Clear all timers
   - Component automatically hides via `enabledWhen: "enabled"` condition

## Additional Fix: Timer Not Restarting on Track Change

**Problem:** Countdown timer displayed the correct initial value but wouldn't restart when tracks changed. Disabling and re-enabling the plugin would fix it temporarily.

**Root Cause:** `useMachine()` doesn't automatically restart when a new machine is passed to it. Even though `useMemo` created a new machine when `start` changed, React kept using the first machine instance.

**Solution: React Key-based Remounting**

Split the component into two parts and use `key={start}` to force remount:

```typescript
// Outer component - reads from store and resolves config
function CountdownTemplateComponent({ startKey, duration, emoji }) {
  const { store, config } = usePluginComponentContext()
  const start = store[startKey]
  const resolvedDuration = /* resolve config.timeLimit */

  // Key by start time - forces remount when track changes
  return <CountdownTimerDisplay key={start} start={start} duration={resolvedDuration} emoji={emoji} />
}

// Inner component - manages the timer machine
function CountdownTimerDisplay({ start, duration, emoji }) {
  const [state] = useMachine(createTimerMachine({ start, duration }))
  return <HStack>...</HStack>
}
```

**How It Works:**

1. When `trackStartTime` updates in store, `start` changes
2. React sees different `key` value on `CountdownTimerDisplay`
3. React unmounts old instance and mounts new one
4. New instance creates fresh `useMachine()` with new start time
5. Timer counts down from new start time

**Alternative Considered:** Sending a "reset" event to the existing machine. Rejected because:

- Requires modifying TimerMachine to handle reset events
- More complex state management
- Key-based remounting is idiomatic React pattern

## Testing Checklist

- [x] Countdown only appears when track is playing
- [x] Countdown starts from track's `playedAt` timestamp
- [x] Timer counts down correctly using config timeLimit
- [x] Timer triggers skip check when expired
- [x] Skip info only shows on actually skipped tracks
- [x] Skip info shows correct vote counts per track
- [x] No TypeScript/linter errors (warnings are acceptable)
- [x] Hardcoded countdown removed from NowPlayingTrack.tsx
- [x] Plugin component countdown renders in nowPlaying area
- [x] Timer restarts when track changes (fixed with key prop)
- [x] Timer disappears when plugin disabled
- [x] Timer reappears when plugin re-enabled (if track playing)
- [x] Timer starts from correct position when re-enabled mid-track

## Lessons Learned

1. **Match data scope to UI scope**: Room-level components for room-level data, per-item augmentation for per-item data
2. **Component state is read-only on mount**: No push updates (yet) - components manage their own derived state
3. **XState machines are self-sufficient**: Countdown doesn't need external updates once it has start time and duration
4. **Playlist augmentation is powerful**: Perfect for adding metadata to list items
