# Adapter Credentials Architecture

## Pattern: User Credentials → Room Adapters

### Overview
Spotify credentials are **stored per-user** in Redis, then **passed to room adapters** when rooms are created or accessed. This allows multiple rooms to share user credentials while maintaining room-specific adapter configurations.

---

## Implementation

### 1. User Credentials Storage (Redis)

**Location**: `user:${userId}:service:${serviceName}:auth`

**Stored by**: `@repo/adapter-spotify/lib/serviceAuth.ts`

```typescript
{
  accessToken: "BQC8z...",
  refreshToken: "AQD9m...",
  expiresAt: 1234567890
}
```

**When**: User completes Spotify OAuth flow

---

### 2. Room-Specific Adapter Configuration

**Service**: `AdapterService` (`packages/server/services/AdapterService.ts`)

#### PlaybackController (Lines 17-94)
```typescript
async getRoomPlaybackController(roomId: string): Promise<PlaybackController | null> {
  // Check cache first
  if (this.roomPlaybackControllers.has(roomId)) {
    return this.roomPlaybackControllers.get(roomId)!
  }

  const room = await findRoom({ context: this.context, roomId })
  
  // Create room-specific adapter with dynamic token fetching
  const playbackController = await adapterModule.register({
    authentication: {
      type: "oauth",
      clientId: process.env.SPOTIFY_CLIENT_ID,
      getStoredTokens: async () => {
        // Fetch room creator's credentials from Redis on each API call
        const auth = await this.context.data.getUserServiceAuth({
          userId: room.creator,
          serviceName: "spotify"
        })
        
        return {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken
        }
      }
    }
  })

  // Cache for room lifetime
  this.roomPlaybackControllers.set(roomId, playbackController)
  return playbackController
}
```

#### MetadataSource (Lines 100-176)
```typescript
async getRoomMetadataSource(roomId: string): Promise<MetadataSource | null> {
  // Check cache first
  if (this.roomMetadataSources.has(roomId)) {
    return this.roomMetadataSources.get(roomId)!
  }

  const room = await findRoom({ context: this.context, roomId })
  
  // Create room-specific metadata source with dynamic token fetching
  const metadataSource = await adapterModule.register({
    authentication: {
      type: "oauth",
      clientId: process.env.SPOTIFY_CLIENT_ID,
      getStoredTokens: async () => {
        // Fetch room creator's credentials from Redis on each API call
        const auth = await this.context.data.getUserServiceAuth({
          userId: room.creator,
          serviceName: "spotify"
        })
        
        return {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken
        }
      }
    }
  })

  // Cache for room lifetime
  this.roomMetadataSources.set(roomId, metadataSource)
  return metadataSource
}
```

---

### 3. Adapter Usage (Shoutcast Example)

**File**: `packages/adapter-shoutcast/index.ts` (Lines 73-81)

```typescript
// Shoutcast polling job for radio rooms
if (room.fetchMeta && room.metadataSourceId) {
  const { AdapterService } = await import("@repo/server/services/AdapterService")
  const adapterService = new AdapterService(context)
  
  // Get room-specific metadata source (uses creator's credentials)
  const metadataSource = await adapterService.getRoomMetadataSource(room.id)
  
  if (metadataSource?.api?.search) {
    // Search Spotify with room creator's auth token
    const searchResults = await metadataSource.api.search(query)
  }
}
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────┐
│ 1. User Authenticates with Spotify                 │
│    POST /auth/spotify/callback                      │
│    → Store in Redis: user:alice:service:spotify:auth│
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 2. Alice Creates Radio Room                        │
│    POST /rooms/create                               │
│    → Room stored with: { creator: "alice" }         │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 3. Shoutcast Polling Job Starts                    │
│    → Needs to search Spotify for track info        │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 4. Get Room MetadataSource                         │
│    adapterService.getRoomMetadataSource(roomId)     │
│                                                      │
│    a) Check cache → Not found                       │
│    b) Fetch room → room.creator = "alice"           │
│    c) Create MetadataSource with callback:          │
│       getStoredTokens: async () => {                │
│         return getUserServiceAuth("alice", "spotify")│
│       }                                              │
│    d) Cache for room lifetime                       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ 5. Search Spotify                                   │
│    metadataSource.api.search("Tom T. Hall")        │
│    → getStoredTokens() called                       │
│    → Fetches alice's credentials from Redis         │
│    → Uses accessToken for Spotify API               │
│    → Returns enriched track data with URLs/images   │
└─────────────────────────────────────────────────────┘
```

---

## Benefits

### ✅ Single Source of Truth
- User credentials stored once in Redis
- All rooms created by that user use the same credentials

### ✅ Room-Specific Configuration
- Each room gets its own adapter instances
- Adapters cached for performance
- No global state pollution

### ✅ Dynamic Token Fetching
- `getStoredTokens()` callback fetches credentials on-demand
- Tokens refreshed automatically if expired
- No stale credentials in memory

### ✅ Separation of Concerns
- **User Auth**: Handles OAuth flow, stores credentials
- **Adapter Service**: Creates and caches room adapters
- **Adapters**: Use credentials via callback, don't store them

### ✅ Multi-Room Support
- Alice can create multiple rooms
- Each room has its own adapter instance
- All use Alice's Spotify credentials
- If Alice's token refreshes, all rooms benefit

---

## Key Files

1. **`packages/server/services/AdapterService.ts`**
   - `getRoomPlaybackController()` - Lines 17-94
   - `getRoomMetadataSource()` - Lines 100-176
   - Caches: `roomPlaybackControllers`, `roomMetadataSources`

2. **`packages/adapter-spotify/lib/serviceAuth.ts`**
   - Stores/retrieves user credentials from Redis
   - Handles token refresh

3. **`packages/adapter-shoutcast/index.ts`**
   - Uses `getRoomMetadataSource()` for enrichment
   - Lines 73-81

4. **`apps/api/src/server.ts`**
   - Registers global adapter modules
   - No user credentials in startup config

---

## Testing Flow

1. **User authenticates**: `GET /auth/spotify` → OAuth → credentials in Redis
2. **Create radio room**: `POST /rooms/create` → Room with `creator: userId`
3. **Shoutcast polls**: Job runs → `getRoomMetadataSource()` → Fetches creator credentials → Searches Spotify
4. **Check logs**: Should see "Shoutcast: ✓ Found enriched metadata" with URLs and images
5. **Frontend**: Track data should have populated `urls` and `images` arrays

---

## Troubleshooting

### "No auth tokens found for room creator"
- Room creator hasn't authenticated with Spotify
- Check Redis: `redis-cli GET user:${userId}:service:spotify:auth`

### "Metadata enrichment unavailable (auth required)"
- This error should no longer appear with the new implementation
- If it does, check that `getRoomMetadataSource()` is being called correctly

### Empty URLs/Images
- Check logs for "Shoutcast: - URLs: 0" or "Shoutcast: - Images: 0"
- If 0, the Spotify search might not be finding the track
- Check search query in logs

---

## Migration Notes

**Before**: Global metadata source with placeholder tokens  
**After**: Room-specific metadata sources with user credentials

**No breaking changes**: Existing rooms will automatically get configured adapters on first access.

