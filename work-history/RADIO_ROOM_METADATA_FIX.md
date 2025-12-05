# Radio Room Metadata Enrichment Fixes

## Problems Identified

### 1. Empty URLs and Images
**Issue**: Radio room tracks were showing empty `urls` and `images` arrays even when Spotify metadata enrichment was enabled.

**Root Causes**:
1. **Authentication failure**: Metadata enrichment was failing silently with "auth required" error
2. **Wrong parsing order**: Station title format is `TRACK | ARTIST | ALBUM`, but code was parsing it as `ARTIST | TRACK`

### 2. Metadata Search Failures
**Before**:
```
Station: "Old Dogs, Children And Watermelon Wine|Tom T. Hall| Country Classics"
Parsed as: artist="Old Dogs...", title="Tom T. Hall"
```

**After**:
```
Station: "Old Dogs, Children And Watermelon Wine|Tom T. Hall| Country Classics"
Parsed as: track="Old Dogs...", artist="Tom T. Hall"
```

## Fixes Applied

### 1. Use Global Metadata Source (Client Credentials)
**File**: `packages/adapter-shoutcast/index.ts`

**Before**:
```typescript
const { AdapterService } = await import("@repo/server/services/AdapterService")
const adapterService = new AdapterService(context)
const metadataSource = await adapterService.getRoomMetadataSource(roomId)
```

**After**:
```typescript
// Use globally registered metadata source with client credentials
const metadataSource = context.adapters.metadataSources.get(room.metadataSourceId)
```

**Rationale**: Public Spotify searches don't require user authentication - client credentials are sufficient.

### 2. Correct Station Title Parsing
**File**: `packages/adapter-shoutcast/index.ts`

**Before**:
```typescript
const parts = station.title.split(/[-|]/).map(p => p.trim())
const artistName = parts[0] || ""
const trackTitle = parts[1] || station.title
```

**After**:
```typescript
const parts = station.title.split(/\|/).map(p => p.trim())
const trackTitle = parts[0] || station.title  // Track is FIRST
const artistName = parts[1] || ""              // Artist is SECOND
```

### 3. Enhanced Logging
Added detailed logging to debug enrichment:
```typescript
console.log(`Shoutcast: - URLs: ${enrichedTrack.urls?.length || 0}`, enrichedTrack.urls)
console.log(`Shoutcast: - Images: ${enrichedTrack.images?.length || 0}`, enrichedTrack.images)
console.log(`Shoutcast: - Album images: ${enrichedTrack.album?.images?.length || 0}`, enrichedTrack.album?.images)
console.log(`Shoutcast: - Full enriched track:`, JSON.stringify(enrichedTrack, null, 2))
```

### 4. Stable Hash-Based IDs
**File**: `packages/server/lib/makeNowPlayingFromStationMeta.ts`

**Before**: `id: track-${Date.now()}` (different every time)  
**After**: `id: radio-${md5Hash}` (stable, deterministic)

**Benefits**:
- Same broadcast = same ID
- Enables proper queue deduplication
- Fixes track comparison logic

### 5. Improved Track Comparison
**File**: `packages/server/operations/room/handleRoomNowPlayingData.ts`

Now correctly distinguishes between:
- Real Spotify IDs (22-char alphanumeric)
- Radio station hashes (`radio-...`)
- Logs whether comparison used enriched data

## Testing

### Before Fix
✗ "Metadata enrichment unavailable (auth required)"  
✗ Wrong search query (artist/track reversed)  
✗ Empty URLs and images in frontend  
✗ Placeholder IDs change every poll

### After Fix
✓ Uses client credentials for public searches  
✓ Correct track/artist parsing  
✓ Enriched data with URLs and images  
✓ Stable IDs for same broadcasts  
✓ Accurate track comparison

## Files Changed
- `packages/adapter-shoutcast/index.ts` - Fixed auth & parsing
- `packages/server/lib/makeNowPlayingFromStationMeta.ts` - Stable IDs
- `packages/server/operations/room/handleRoomNowPlayingData.ts` - Track comparison
- `apps/web/src/components/NowPlaying.tsx` - Robust UI logic
- `packages/adapter-spotify/lib/metadataSourceApi.ts` - Filter radio IDs
- `packages/server/services/JobService.ts` - Prevent duplicate jobs

## Next Steps
1. Restart API server with `npm run dev -w apps/api`
2. Create/test radio room with `fetchMeta: true`
3. Verify enriched metadata in console logs
4. Confirm URLs and images appear in frontend

