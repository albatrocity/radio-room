# Proposal: Separate MediaSource and MetadataSource Track IDs

## Problem Statement

Currently, Radio Room uses a single `track.id` field to serve multiple conflicting purposes:

1. **Storage/Comparison**: Redis keys and track comparison logic
2. **API Operations**: Spotify API calls (`checkSavedTracks`, `addToLibrary`, etc.)
3. **MediaSource Identity**: Raw station/stream identification
4. **MetadataSource Identity**: Enriched track metadata from Spotify

This leads to:

- ❌ Synthetic "fake" IDs (`radio-${hash}`) that pretend to be real Spotify IDs
- ❌ Complex validation logic to filter out synthetic IDs before API calls
- ❌ String-based conventions (`startsWith("radio-")`) instead of type safety
- ❌ Coupling between adapters (Spotify adapter knows about radio rooms)
- ❌ Fragile comparison logic that checks ID format before comparing

## Proposed Solution

### 1. Type Definitions

```typescript
// Source type unions
type MediaSourceType = "spotify" | "shoutcast" | "applemusic"
type MetadataSourceType = "spotify" | "tidal" | "applemusic"

// Source objects with explicit typing
interface MediaSourceInfo {
  type: MediaSourceType
  trackId: string
}

interface MetadataSourceInfo {
  type: MetadataSourceType
  trackId: string
}
```

### 2. New Data Model

```typescript
// Current (Single ID)
interface QueueItem {
  title: string
  track: MetadataSourceTrack // track.id serves all purposes ❌
  addedAt: number
  addedBy: User | undefined
  addedDuring: string | undefined
  playedAt: number | undefined
}

// Proposed (Separate IDs with Source Types)
interface QueueItem {
  title: string
  track: MetadataSourceTrack // Still has metadata

  // NEW: Separate sources with explicit types
  mediaSource: MediaSourceInfo // Always present, stable identity
  metadataSource?: MetadataSourceInfo // Optional, when enriched

  addedAt: number
  addedBy: User | undefined
  addedDuring: string | undefined
  playedAt: number | undefined
}
```

### 2. ID Generation by Source

#### Jukebox Rooms (Spotify MediaSource + MetadataSource)

```typescript
{
  mediaSource: {
    type: "spotify",
    trackId: "7ouMYWpwJ422jRcDASZB7P"
  },
  metadataSource: {
    type: "spotify",
    trackId: "7ouMYWpwJ422jRcDASZB7P"  // Same ID, both from Spotify
  },
  track: {
    id: "7ouMYWpwJ422jRcDASZB7P",  // Keep for backward compatibility
    title: "Old Dogs, Children and Watermelon Wine",
    // ... full Spotify metadata
  }
}
```

#### Radio Rooms (Shoutcast MediaSource, Spotify MetadataSource)

**Without enrichment:**

```typescript
{
  mediaSource: {
    type: "shoutcast",
    trackId: "abc123hash"  // Stable hash of station title
  },
  metadataSource: undefined,  // No enrichment
  track: {
    id: "shoutcast:abc123hash",  // Falls back to mediaSource
    title: "Old Dogs, Children and Watermelon Wine",
    // ... minimal metadata from Shoutcast
  }
}
```

**With enrichment:**

```typescript
{
  mediaSource: {
    type: "shoutcast",
    trackId: "abc123hash"  // Stable, for comparison
  },
  metadataSource: {
    type: "spotify",
    trackId: "7ouMYWpwJ422jRcDASZB7P"  // Real Spotify ID
  },
  track: {
    id: "7ouMYWpwJ422jRcDASZB7P",  // Spotify ID for backward compatibility
    title: "Old Dogs, Children and Watermelon Wine",
    // ... full Spotify metadata (enriched)
  }
}
```

### 3. Usage Patterns

#### Track Comparison (Always use mediaSource)

```typescript
// Before: Complex logic based on ID format
const { parseTrackId } = await import("@repo/utils/trackId")
const currentHasRealId = parseTrackId(current.nowPlaying.track.id).isServiceId
const newHasRealId = parseTrackId(nowPlaying.track.id).isServiceId
if (currentHasRealId && newHasRealId) {
  isSameTrack = current.nowPlaying.track.id === nowPlaying.track.id
} else if (stationMeta?.title) {
  isSameTrack = current.stationMeta.title === stationMeta.title
}

// After: Simple, always reliable, type-safe
const isSameTrack =
  current.nowPlaying.mediaSource.type === nowPlaying.mediaSource.type &&
  current.nowPlaying.mediaSource.trackId === nowPlaying.mediaSource.trackId
```

#### Redis Storage (Use mediaSource for stability)

```typescript
// Before: Uses track.id (could be synthetic or real)
await redis.sAdd(`room:${roomId}:queue`, item.track.id)
await redis.set(`room:${roomId}:queued_track:${item.track.id}`, JSON.stringify(item))

// After: Use composite key (includes source type for clarity)
const key = `${item.mediaSource.type}:${item.mediaSource.trackId}`
await redis.sAdd(`room:${roomId}:queue`, key)
await redis.set(`room:${roomId}:queued_track:${key}`, JSON.stringify(item))
```

#### API Operations (Use metadataSource when available)

```typescript
// Before: Filter out synthetic IDs
const { filterSpotifyTrackIds } = await import("@repo/utils/trackId")
const validTrackIds = filterSpotifyTrackIds(trackIds)

// After: Filter by metadataSource type (explicit and type-safe)
const spotifyIds = queueItems
  .filter((item) => item.metadataSource?.type === "spotify")
  .map((item) => item.metadataSource!.trackId)

await spotifyApi.currentUser.tracks.hasSavedTracks(spotifyIds)
```

#### Finding Tracks in Queue

```typescript
// Before: Compare by track.id
const inQueue = queue.find((item) => item.track.id === nowPlaying.track.id)

// After: Compare by mediaSource (stable across enrichment)
const inQueue = queue.find(
  (item) =>
    item.mediaSource.type === nowPlaying.mediaSource.type &&
    item.mediaSource.trackId === nowPlaying.mediaSource.trackId,
)
```

---

## Benefits

### 1. **Type Safety**

- No more string-based conventions (`startsWith("radio-")`)
- Explicit source types: `mediaSource.type` is a union type
- Clear semantics: `metadataSource` can be `undefined`
- TypeScript can enforce correct usage at compile time
- Can discriminate by source type for type narrowing

### 2. **Separation of Concerns**

- MediaSource: Provides stable identity for comparison/storage
- MetadataSource: Provides rich metadata and API-compatible IDs
- No adapters need to know about each other

### 3. **Stable Comparison**

- `mediaSource` never changes, even if enrichment fails/succeeds
- Compare both type and ID for accuracy
- Radio rooms: Same broadcast = same `mediaSource.trackId`
- No ambiguity about which service an ID belongs to

### 4. **Clean API Operations**

- Filter by `metadataSource.type === "spotify"` (explicit)
- No need for string parsing or format detection
- Clear which operations require enrichment
- Can route to correct API based on source type

### 5. **Extensibility**

- Easy to add new MediaSources: just add to union type
- Easy to add new MetadataSources: just add to union type
- Each source can have its own ID format
- Type system ensures correct handling of each source

### 6. **Debugging & Observability**

- Logs show exactly which source provided data
- Can see enrichment status at a glance
- No guessing what kind of ID you're looking at
- Easier to trace data flow through the system

---

## Migration Strategy

### Phase 1: Additive Changes (Non-Breaking)

1. **Add new fields to `QueueItem` interface** (optional):

```typescript
interface QueueItem {
  title: string
  track: MetadataSourceTrack

  // NEW: Optional during migration
  mediaSource?: MediaSourceInfo
  metadataSource?: MetadataSourceInfo

  addedAt: number
  // ...
}
```

2. **Update track creation** to populate source objects:

```typescript
// In makeNowPlayingFromStationMeta.ts
export default async function makeNowPlayingFromStationMeta(
  stationMeta?: Station,
): Promise<QueueItem> {
  const trackId = makeStableTrackId(stationMeta)
  return {
    title: trackTitle,
    mediaSource: {
      type: "shoutcast",
      trackId,
    },
    metadataSource: undefined, // No enrichment
    track: {
      id: `shoutcast:${trackId}`, // Fallback for backward compatibility
      // ...
    },
  }
}

// In Shoutcast adapter when enriched
const nowPlaying = {
  title: enrichedTrack.title,
  mediaSource: {
    type: "shoutcast",
    trackId: makeStableTrackId(station),
  },
  metadataSource: {
    type: "spotify",
    trackId: enrichedTrack.id,
  },
  track: enrichedTrack, // Full Spotify metadata
  // ...
}
```

3. **Update operations to prefer new fields**:

```typescript
// Gradually update functions to use new source objects when available
const trackKey = item.mediaSource
  ? `${item.mediaSource.type}:${item.mediaSource.trackId}`
  : item.track.id // Fallback during migration
```

### Phase 2: Migration

1. **Migrate existing Redis data**:
   - Script to read all queued tracks
   - Add `mediaSourceTrackId` and `metadataSourceTrackId` fields
   - Re-save to Redis

2. **Update all operations** to use new fields

3. **Remove fallback logic** once all data is migrated

### Phase 3: Cleanup

1. **Make `mediaSource` required** (remove `?`):

```typescript
interface QueueItem {
  mediaSource: MediaSourceInfo // Required (always present)
  metadataSource?: MetadataSourceInfo // Still optional (enrichment may fail)
}
```

2. **Remove synthetic ID utilities**:
   - Delete `packages/utils/trackId.ts` (no longer needed)
   - Remove ID filtering from Spotify adapter

3. **Simplify comparison logic** in `handleRoomNowPlayingData.ts`

---

## Files to Update

### Types

- ✏️ `packages/types/Queue.ts` - Add new ID fields
- ✏️ `packages/types/MetadataSource.ts` - Update if needed

### MediaSource Adapters

- ✏️ `packages/adapter-spotify/lib/mediaSourceAdapter.ts` - Generate mediaSourceTrackId
- ✏️ `packages/adapter-shoutcast/index.ts` - Generate stable shoutcast IDs

### Operations

- ✏️ `packages/server/operations/data/djs.ts` - Use mediaSourceTrackId for Redis keys
- ✏️ `packages/server/operations/room/handleRoomNowPlayingData.ts` - Simplify comparison
- ✏️ `packages/server/lib/makeNowPlayingFromStationMeta.ts` - Add ID fields

### Adapters

- ✏️ `packages/adapter-spotify/lib/metadataSourceApi.ts` - Use metadataSourceTrackId
- ✏️ `packages/adapter-spotify/lib/playbackControllerApi.ts` - If affected

### Utilities

- 🗑️ `packages/utils/trackId.ts` - Delete (Phase 3)

---

## Backward Compatibility

During migration, `track.id` will continue to work:

```typescript
// Jukebox rooms: track.id === mediaSourceTrackId === metadataSourceTrackId
track.id = "7ouMYWpwJ422jRcDASZB7P"

// Radio rooms (enriched): track.id === metadataSourceTrackId
track.id = "7ouMYWpwJ422jRcDASZB7P"

// Radio rooms (unenriched): track.id === mediaSourceTrackId
track.id = "shoutcast:abc123hash"
```

Frontend can continue using `track.id` for display/linking without changes.

---

## Alternative Considered

### Keep Current Approach

**Pros:**

- No migration needed
- Works for current use cases

**Cons:**

- Synthetic IDs are a leaky abstraction
- Complexity in filtering/validation
- Hard to extend to new sources
- Coupling between adapters

### Use Composite Keys

```typescript
mediaSourceTrackId: { source: "shoutcast", id: "abc123" }
metadataSourceTrackId: { source: "spotify", id: "7ouMY..." }
```

**Pros:**

- More structured

**Cons:**

- More complex
- Harder to use as Redis keys
- Overkill for current needs

---

## Risk Assessment

### Low Risk

- Additive changes (Phase 1) are non-breaking
- Can test thoroughly before making fields required
- Fallback to `track.id` provides safety net

### Medium Risk

- Redis data migration needs careful execution
- Need to handle in-flight requests during migration

### Mitigation

- Feature flag for new ID logic
- Gradual rollout with monitoring
- Automated migration script with rollback plan
- Comprehensive testing on staging environment

---

## Timeline Estimate

- **Phase 1** (Additive): 2-3 days
  - Update types
  - Update track creation
  - Add new fields (optional)
  - Tests

- **Phase 2** (Migration): 1-2 days
  - Redis migration script
  - Update all operations
  - Deploy and monitor

- **Phase 3** (Cleanup): 1 day
  - Remove fallbacks
  - Delete old utilities
  - Final tests

**Total: ~1 week** for full implementation and testing

---

## Decision

**Recommendation**: ✅ Proceed with this refactor

The benefits significantly outweigh the migration cost:

- Cleaner architecture
- Type-safe
- Extensible
- Removes technical debt

The migration can be done incrementally with low risk.

---

## Additional Benefits of Source Type Tracking

### Smart API Routing

```typescript
// Route to correct API based on metadataSource type
async function checkIfSaved(item: QueueItem): Promise<boolean> {
  if (!item.metadataSource) return false

  switch (item.metadataSource.type) {
    case "spotify":
      return await spotifyApi.hasSavedTrack(item.metadataSource.trackId)
    case "tidal":
      return await tidalApi.isFavorite(item.metadataSource.trackId)
    case "applemusic":
      return await appleMusicApi.isInLibrary(item.metadataSource.trackId)
  }
}
```

### Source-Specific Features

```typescript
// Enable features based on source capabilities
function canAddToLibrary(item: QueueItem): boolean {
  // Only Spotify and Tidal support library management
  return item.metadataSource?.type === "spotify" || item.metadataSource?.type === "tidal"
}

function canCreatePlaylist(item: QueueItem): boolean {
  // All metadata sources support playlist creation
  return item.metadataSource !== undefined
}
```

### Analytics & Logging

```typescript
// Track source usage
console.log(`Track sourced from ${item.mediaSource.type}`)
if (item.metadataSource) {
  console.log(`Enriched with ${item.metadataSource.type} metadata`)
}

// Metrics
metrics.increment(`tracks.media_source.${item.mediaSource.type}`)
if (item.metadataSource) {
  metrics.increment(`tracks.enrichment.${item.metadataSource.type}`)
}
```

## Open Questions

1. ✅ Should we store source types? **YES** - Updated proposal to include them
2. Do we need a migration window where both old and new logic coexist?
3. Should we version the QueueItem structure for future changes?
4. How do we handle tracks that are in both queue and playlist during migration?
5. Should we create utility functions for common source type checks?

---

## Next Steps

1. ✅ Review this proposal
2. ⏳ Get team/stakeholder approval
3. ⏳ Create implementation tasks
4. ⏳ Implement Phase 1 (additive changes)
5. ⏳ Test thoroughly on staging
6. ⏳ Execute migration
7. ⏳ Monitor and verify
8. ⏳ Cleanup phase
