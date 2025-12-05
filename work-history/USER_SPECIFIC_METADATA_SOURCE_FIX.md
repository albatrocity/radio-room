# User-Specific Metadata Source Fix

## Problem

After implementing the adapter-based library management, users were getting:
```
Bad or expired token. This can happen if the user revoked a token or 
the access token has expired. You should re-authenticate the user.
```

## Root Cause

The `AdapterService.getRoomMetadataSource()` method was returning a **cached metadata source** that was registered at server startup with **placeholder credentials**:

```typescript
// Server startup - placeholder tokens
authentication: {
  type: "oauth",
  async getStoredTokens() {
    return { accessToken: "placeholder", refreshToken: "placeholder" }
  },
}
```

When library operations (add/remove from library) tried to use this cached instance, they were using invalid/expired tokens.

## Solution

Modified `AdapterService.getRoomMetadataSource()` to **create a fresh metadata source instance with the user's current credentials** from Redis:

### Before ❌
```typescript
async getRoomMetadataSource(roomId: string, userId?: string) {
  const room = await findRoom({ context: this.context, roomId })
  
  // Returns cached instance with placeholder tokens
  const source = this.context.adapters.metadataSources.get(room.metadataSourceId)
  return source ?? null
}
```

### After ✅
```typescript
async getRoomMetadataSource(roomId: string, userId?: string) {
  const room = await findRoom({ context: this.context, roomId })
  const targetUserId = userId ?? room.creator
  
  // 1. Get adapter module (not cached instance)
  const adapterModule = this.context.adapters.metadataSourceModules.get(
    room.metadataSourceId
  )
  
  // 2. Get user's fresh credentials from Redis
  const auth = await this.context.data.getUserServiceAuth({
    userId: targetUserId,
    serviceName: room.metadataSourceId,
  })
  
  // 3. Create NEW instance with user's current tokens
  const userMetadataSource = await adapterModule.register({
    name: room.metadataSourceId,
    authentication: {
      type: "oauth",
      clientId: process.env.SPOTIFY_CLIENT_ID,
      token: {
        accessToken: auth.accessToken,      // ✅ User's actual token
        refreshToken: auth.refreshToken,     // ✅ User's actual token
      },
      async getStoredTokens() {
        return {
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
        }
      },
    },
    // ... other config
  })
  
  return userMetadataSource
}
```

## Key Changes

1. **Retrieves adapter module** instead of cached instance
2. **Gets user credentials** from Redis via `context.data.getUserServiceAuth`
3. **Creates fresh instance** with user's actual access/refresh tokens
4. **Falls back to room creator** if no specific userId provided

## Flow

### Library Management Operation
```
1. User clicks heart icon
   ↓
2. Frontend sends socket event: "add to library"
   ↓
3. Server handler calls: adapterService.getRoomMetadataSource(roomId, userId)
   ↓
4. Method retrieves user's tokens from Redis
   ↓
5. Creates fresh metadata source instance with those tokens
   ↓
6. Calls library method: metadataSource.api.addToLibrary(trackIds)
   ↓
7. Spotify Web API called with VALID user tokens ✅
   ↓
8. Success! Track added to user's library
```

## Benefits

✅ **Uses fresh credentials**: Always gets current tokens from Redis
✅ **User-specific**: Each user gets their own instance with their tokens
✅ **Handles token refresh**: If tokens are refreshed, next call gets new ones
✅ **Falls back gracefully**: Returns null if no credentials available
✅ **Works with token rotation**: Background job keeps tokens fresh

## Testing

1. **Create room as admin**
   - Login stores tokens in Redis
2. **Click heart icon on a track**
   - Should add to your Spotify library
   - Check Spotify app to verify
3. **Wait for token refresh** (or manually trigger)
   - Library operations should still work
4. **Check server logs**
   ```
   Retrieved spotify access token for room creator abc123
   Library management not supported for this service (shoutcast)
   ```

## Related Files

- `packages/server/services/AdapterService.ts` - Main fix
- `packages/server/handlers/djHandlersAdapter.ts` - Library handlers
- `packages/server/services/AuthService.ts` - Token retrieval on login
- `packages/adapter-spotify/lib/serviceAuth.ts` - Token refresh

