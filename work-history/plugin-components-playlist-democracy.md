# Playlist Democracy Plugin Components Implementation

## Summary

Migrated the playlist-democracy plugin to use the new Plugin Components system, eliminating the need for plugin-specific React components in the frontend.

## New Template Component: `countdown`

Added a new built-in template component for countdown timers.

### Type Definition

```typescript
interface CountdownComponentProps {
  /** Store key containing the start timestamp (ISO string or unix ms) */
  startKey: string
  /** Duration in milliseconds, or config key like "config.timeLimit" */
  duration: number | string
  /** Emoji to display (shortcode without colons) */
  emoji?: string
}
```

### Features

- **Flexible Duration**: Supports both numeric values and config references (`"config.timeLimit"`)
- **Store Integration**: Reads start time from plugin component store
- **Emoji Support**: Optional emoji display (uses emoji-mart)
- **XState Timer**: Uses existing `TimerMachine` for accurate countdown
- **Auto-refresh**: Updates every second until expired

### Frontend Implementation

Located in `apps/web/src/components/PluginComponents/PluginComponentRenderer.tsx`:

```typescript
function CountdownTemplateComponent({
  startKey,
  duration,
  emoji,
}: CountdownComponentProps) {
  const { store, config } = usePluginComponentContext()
  
  // Resolve start time from store
  const start = store[startKey]
  
  // Resolve duration (number or config.key)
  let resolvedDuration = typeof duration === "number" ? duration : 0
  if (typeof duration === "string" && duration.startsWith("config.")) {
    const configKey = duration.substring(7)
    resolvedDuration = config[configKey]
  }
  
  // Create timer machine
  const [state] = useMachine(
    useMemo(() => createTimerMachine({ start, duration: resolvedDuration }), [start, resolvedDuration])
  )
  
  // Render countdown
  return (
    <HStack>
      {emoji && <em-emoji shortcodes={`:${emoji}:`} />}
      <Text fontSize="2xs">{remaining}s</Text>
    </HStack>
  )
}
```

## Playlist Democracy Plugin Updates

### Component Schema

```typescript
getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Countdown timer in now playing area
      {
        id: "now-playing-countdown",
        type: "countdown",
        area: "nowPlaying",
        enabledWhen: "enabled",
        startKey: "trackStartTime",
        duration: "config.timeLimit", // Reference to config
        emoji: "{{config.reactionType}}", // String interpolation
      },
      // Skip info in playlist items
      {
        id: "playlist-skip-info",
        type: "text",
        area: "playlistItem",
        enabledWhen: "enabled",
        content: "Skipped: {{voteCount}}/{{requiredCount}} votes",
      },
    ],
    storeKeys: ["trackStartTime", "voteCount", "requiredCount", "isSkipped"],
  }
}
```

### Component State Management

**Initial State** (`getComponentState`):
- Returns current track start time, vote count, and required count
- Called once when room loads

**Real-time Updates** (`updateComponentState`):
- `onTrackChanged`: Updates `trackStartTime`, resets `voteCount` to 0
- `onReactionAdded`: Increments `voteCount`
- `onReactionRemoved`: Decrements `voteCount`
- All updates emit events to frontend via `SystemEvents`

### Config Reference Patterns

Two ways to reference config in component props:

1. **String Interpolation** (for strings):
   ```typescript
   emoji: "{{config.reactionType}}" // → Interpolated in frontend
   ```

2. **Direct Config Reference** (for numbers):
   ```typescript
   duration: "config.timeLimit" // → Resolved in component
   ```

## Benefits

1. **No Plugin-Specific UI Code**: Frontend has no playlist-democracy-specific components
2. **Declarative**: Plugin defines what to show, not how to show it
3. **Reusable**: `countdown` component can be used by other plugins
4. **Type-Safe**: Full TypeScript support for component props
5. **Real-time Updates**: Component state updates automatically via socket events
6. **Config-Driven**: UI adapts to plugin configuration (emoji, duration)

## Architecture Flow

```
Plugin (Backend)
├── getComponentSchema() → Defines UI structure (static)
├── getComponentState() → Initial data fetch
└── updateComponentState() → Real-time updates
         ↓ (SystemEvents)
Frontend
├── PluginArea → Filters components by area
├── PluginComponentRenderer → Checks enabledWhen
└── CountdownTemplateComponent → Renders with store + config
```

## Hardcoded UI Removed

Successfully removed hardcoded playlist-democracy UI from the frontend:

**Before:**
- `NowPlaying/index.tsx` - Fetched `settingsMachine` for playlistDemocracy config
- `NowPlayingTrack.tsx` - Received `timerEnabled` and `timerSettings` props
- Rendered `<CountdownTimerProvider>` with `<NowPlayingVoteCountdown>` inline

**After:**
- No playlist-democracy imports or logic in NowPlaying components
- Plugin defines countdown component declaratively via `getComponentSchema()`
- `PluginArea area="nowPlaying"` renders the countdown automatically when plugin enabled
- Plugin manages its own state via `getComponentState()`

**Files Modified:**
- `apps/web/src/components/NowPlaying/index.tsx` - Removed `settingsMachine`, `timerEnabled`, `timerSettings`
- `apps/web/src/components/NowPlaying/NowPlayingTrack.tsx` - Removed countdown JSX and related props

**Unused Components (can be deleted):**
- `apps/web/src/components/NowPlayingVoteCountdown.tsx` - No longer referenced
- `apps/web/src/components/CountdownTimerProvider` export from `CountdownTimer.tsx` - No longer referenced

## Testing Checklist

- [ ] Countdown timer appears in now playing area when plugin enabled
- [ ] Timer counts down using configured timeLimit
- [ ] Timer shows configured reactionType emoji
- [ ] Timer starts from track's playedAt timestamp (not page load)
- [ ] Skip info shows in playlist items (via augmentation)
- [ ] Skip info only appears on actually skipped tracks
- [ ] Timer triggers skip check when expired
- [ ] Track still skips when threshold not met
- [ ] Timer resets when track changes
- [ ] Components disappear when plugin disabled
- [ ] Config changes (emoji, duration) reflect immediately

## Future Enhancements

### Skipped State Display

Currently the "Skipped" text is just a placeholder. To fully implement:

1. Track skipped state in plugin storage
2. Update `isSkipped` in component state when track is skipped
3. Add visual indicator (strikethrough, red color, etc.)
4. Could create a dedicated "skipped badge" component

### Additional Component Ideas

- **Vote Progress Bar**: Visual indicator of votes vs. required
- **Voter List**: Show who has voted with avatars
- **Skip Animation**: Animated transition when track is skipped

## Files Modified

### Backend
- `packages/types/PluginComponent.ts` - Added `CountdownComponentProps` and `countdown` to type system
- `packages/plugin-playlist-democracy/index.ts` - Added `getComponentSchema()` and `getComponentState()`, updated event handlers

### Frontend
- `apps/web/src/types/PluginComponent.ts` - Re-exported countdown types
- `apps/web/src/components/PluginComponents/PluginComponentRenderer.tsx` - Implemented `CountdownTemplateComponent`

