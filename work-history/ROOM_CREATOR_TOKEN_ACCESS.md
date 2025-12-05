# Room Creator Token Access

## Problem

Previously, the app used PKCE authentication to give all users access to authenticated Spotify features (search, liked tracks, add to library). However:
- PKCE has limited user whitelist slots on Spotify API registration
- Guest visitors don't need these features
- The dummy token (`"dummy-access-token"`) was being sent to everyone

## Solution

Only provide Spotify access tokens to **room creators** who have authenticated via OAuth during room creation. This allows:
- Room creators to use authenticated features (search, view liked tracks, add to Spotify library)
- Guest users to participate without needing Spotify authentication
- No wasted whitelist slots on unnecessary auth

## Implementation

### Backend Changes

#### 1. AuthService: Retrieve Creator's Token on Login

```typescript
// packages/server/services/AuthService.ts

async login({ ... }) {
  // ... existing login logic ...
  
  // Get access token for room creator only
  let accessToken: string | undefined = undefined
  if (isAdmin && room.metadataSourceId && this.context.data?.getUserServiceAuth) {
    try {
      const auth = await this.context.data.getUserServiceAuth({
        userId,
        serviceName: room.metadataSourceId, // e.g., "spotify"
      })
      accessToken = auth?.accessToken
      console.log(`Retrieved ${room.metadataSourceId} access token for room creator ${userId}`)
    } catch (error) {
      console.error(`Failed to retrieve access token for room creator ${userId}:`, error)
    }
  }
  
  return {
    initData: {
      // ...
      accessToken, // undefined for guests, valid token for creator
    }
  }
}
```

**Key Points:**
- Only retrieves token if user `isAdmin` (room creator)
- Only retrieves if room has a `metadataSourceId` configured
- Uses the adapter-based token storage (`getUserServiceAuth`)
- Returns `undefined` for all other users

#### 2. ServiceAuth: Publish Token Refresh

```typescript
// packages/adapter-spotify/lib/serviceAuth.ts

refreshAuth: async (userId: string) => {
  // ... refresh token logic ...
  
  await context.data.storeUserServiceAuth({
    userId,
    serviceName: "spotify",
    tokens: newTokens,
  })

  // ✅ NEW: Notify connected clients of refreshed token
  context.redis.pubClient.publish(
    "SPOTIFY:USER_ACCESS_TOKEN_REFRESHED",
    JSON.stringify({ userId, accessToken: refreshed.accessToken }),
  )

  return newTokens
}
```

**Why:**
Tokens expire after ~1 hour. When the background job refreshes them, the frontend needs to receive the new token so authenticated features continue working.

### Frontend Integration

The frontend already handles optional tokens:

```typescript
// apps/web/src/machines/authMachine.ts
type AuthEvent = {
  type: "INIT"
  data: {
    accessToken: string | null  // ✅ Already supports null
    // ...
  }
}

// apps/web/src/machines/spotifySearchMachine.ts
guards: {
  isAuthenticated: (ctx) => !!ctx.accessToken,  // ✅ Works with undefined
  isUnauthenticated: (ctx) => !ctx.accessToken,  // Falls back to server-side search
}
```

## User Experience

### Room Creator (Admin)
1. Creates room → Authenticates with Spotify OAuth
2. Joins room → Receives their access token
3. Can use authenticated features:
   - Search Spotify catalog (client-side, faster)
   - View recently liked tracks
   - Add songs to their Spotify library from the UI
4. Token auto-refreshes in background

### Guest Users
1. Joins room → No authentication needed
2. Receives `accessToken: undefined`
3. Search falls back to server-side (still works!)
4. Can't access creator-only features (liked tracks, add to library)

## Benefits

✅ Room creators get full Spotify integration
✅ Guests don't need Spotify accounts
✅ No wasted API whitelist slots
✅ Tokens stored securely on backend
✅ Auto-refresh keeps features working
✅ Backward compatible with existing code

## Testing

1. **Create a room as admin:**
   - Should see access token in network tab (init data)
   - Search should work client-side (faster)
   
2. **Join as guest:**
   - Should see `accessToken: null` or undefined
   - Search should still work (server-side fallback)
   
3. **Wait 1+ hours:**
   - Admin's token should refresh automatically
   - Features should continue working

4. **Check logs:**
   ```
   Retrieved spotify access token for room creator abc123
   ```

