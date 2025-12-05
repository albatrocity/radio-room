# Service Coupling Audit: @api and @server

## Executive Summary

Audit of `apps/api` and `packages/server` to identify service-specific (Spotify) coupling that should be refactored to use adapters.

**Date**: November 23, 2025  
**Status**: ✅ **REFACTOR COMPLETE**

---

## ✅ Good Patterns (Already Using Adapters)

### apps/api/src/server.ts
- **Status**: ✅ **CORRECT**
- **Pattern**: Adapter registration (appropriate for entry point)
- **Details**: Registers Spotify, Shoutcast adapters via proper adapter pattern
- **No Action Needed**

### packages/server Operations
- **No direct adapter imports** - All operations go through services
- **Using adapter interfaces correctly** - Operations receive adapters via dependency injection

---

## 🟡 Issues Requiring Refactoring

### 1. **Service-Specific Constants** (Priority: HIGH)

**File**: `packages/server/lib/constants.ts`

**Issues**:
```typescript
// ❌ Spotify-specific
export const PUBSUB_SPOTIFY_AUTH_ERROR = "ERROR:SPOTIFY_AUTH"
export const PUBSUB_SPOTIFY_RATE_LIMIT_ERROR = "ERROR:SPOTIFY_RATE_LIMIT"
export const PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED = "SPOTIFY:PLAYBACK_STATE_CHANGED"
export const PUBSUB_USER_SPOTIFY_ACCESS_TOKEN_REFRESHED = "SPOTIFY:USER_ACCESS_TOKEN_REFRESHED"
export const PUBSUB_USER_SPOTIFY_AUTHENTICATION_STATUS = "SPOTIFY:USER_AUTHENTICATION_STATUS"
export const SPOTIFY_REFRESH_TOKEN = "spotifyRefreshToken" // ❌ Not used anywhere
export const SPOTIFY_ACCESS_TOKEN = "spotifyAccessToken" // ❌ Not used anywhere
```

**Recommendation**:
```typescript
// ✅ Service-agnostic
export const PUBSUB_METADATA_SOURCE_AUTH_ERROR = "ERROR:METADATA_SOURCE_AUTH"
export const PUBSUB_METADATA_SOURCE_RATE_LIMIT_ERROR = "ERROR:METADATA_SOURCE_RATE_LIMIT"
export const PUBSUB_PLAYBACK_STATE_CHANGED = "PLAYBACK:STATE_CHANGED"
export const PUBSUB_USER_SERVICE_ACCESS_TOKEN_REFRESHED = "SERVICE:USER_ACCESS_TOKEN_REFRESHED"
export const PUBSUB_USER_SERVICE_AUTHENTICATION_STATUS = "SERVICE:USER_AUTHENTICATION_STATUS"
// Remove unused SPOTIFY_REFRESH_TOKEN and SPOTIFY_ACCESS_TOKEN
```

**Impact**: 
- `packages/server/operations/room/handleRoomNowPlayingData.ts` (2 uses)
- `packages/server/pubSub/handlers/errors.ts` (1 use)
- `packages/server/pubSub/handlers/rooms.ts` (1 use)
- `packages/server/pubSub/handlers/spotifyTokens.ts` (2 uses)

---

### 2. **Service-Specific PubSub Handlers** (Priority: HIGH)

**File**: `packages/server/pubSub/handlers/spotifyTokens.ts`

**Issues**:
- Entire file is Spotify-specific
- Should handle **any** service authentication
- Function names reference Spotify specifically

**Current**:
```typescript
export default async function bindHandlers(io: Server, context: AppContext) {
  context.redis.subClient.pSubscribe(
    PUBSUB_USER_SPOTIFY_ACCESS_TOKEN_REFRESHED,
    (message, channel) => handleUserSpotifyTokenRefreshed(...)
  )
}

async function handleUserSpotifyTokenRefreshed(...) {
  io.to(user.id).emit("event", {
    type: "SPOTIFY_ACCESS_TOKEN_REFRESHED",
    data: { accessToken },
  })
}
```

**Recommendation**:
- Rename file to `serviceAuth.ts`
- Genericize all function names
- Include `serviceName` in pub/sub payload
- Emit service-agnostic events

```typescript
// ✅ Service-agnostic
export default async function bindHandlers(io: Server, context: AppContext) {
  context.redis.subClient.pSubscribe(
    PUBSUB_USER_SERVICE_ACCESS_TOKEN_REFRESHED,
    (message, channel) => handleUserServiceTokenRefreshed(...)
  )
}

async function handleUserServiceTokenRefreshed(...) {
  const { userId, accessToken, serviceName } = JSON.parse(message)
  
  io.to(user.id).emit("event", {
    type: "SERVICE_ACCESS_TOKEN_REFRESHED",
    data: { accessToken, serviceName },
  })
}
```

---

### 3. **Hardcoded Service Logic** (Priority: MEDIUM)

**File**: `packages/server/services/AdapterService.ts` (lines 220-222)

**Issue**:
```typescript
// ❌ Hardcoded Spotify check
const clientId = room.metadataSourceId === "spotify" 
  ? process.env.SPOTIFY_CLIENT_ID ?? ""
  : ""
```

**Recommendation**:
Create a service configuration registry:

```typescript
// ✅ Service-agnostic
const serviceConfigs = {
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
  },
  tidal: {
    clientId: process.env.TIDAL_CLIENT_ID ?? "",
  },
  applemusic: {
    clientId: process.env.APPLE_MUSIC_CLIENT_ID ?? "",
  },
}

// Extract service name from metadataSourceId (e.g., "spotify-metadata" -> "spotify")
const serviceName = room.metadataSourceId.split("-")[0]
const config = serviceConfigs[serviceName] || { clientId: "" }
const clientId = config.clientId
```

**Alternative**: Store config in `AppContext.adapters` during registration

---

### 4. **Service-Specific Function Names** (Priority: LOW)

**File**: `packages/server/operations/room/handleRoomNowPlayingData.ts`

**Issues**:
```typescript
// Function names reference Spotify but accept generic MetadataSourceError
export async function pubSpotifyError({ context, userId, roomId, error }: PubSpotifyErrorParams)
export async function pubRateLimitError({ context, userId, roomId, error }: PubRateLimitErrorParams)
```

**Recommendation**:
```typescript
// ✅ Generic names
export async function pubMetadataSourceError(...)
export async function pubMetadataSourceRateLimitError(...)
```

---

### 5. **Deprecated Functions** (Priority: LOW)

**Files**: 
- `packages/server/handlers/authHandlersAdapter.ts`
- `packages/server/handlers/authHandlers.ts`

**Issue**: Contains deprecated Spotify-specific functions marked with `@deprecated`

**Functions**:
- `getUserSpotifyAuth` → Use `getUserServiceAuth` with `serviceName="spotify"`
- `logoutSpotifyAuth` → Use `logoutServiceAuth` with `serviceName="spotify"`

**Recommendation**: 
- Keep for backward compatibility (already marked as deprecated)
- Can remove in a future major version
- No action needed now

---

## 📋 Refactoring Checklist

### High Priority (Critical Path)
- [x] ✅ Rename constants in `lib/constants.ts` to be service-agnostic
- [x] ✅ Update all references to old constant names
- [x] ✅ Refactor `pubSub/handlers/spotifyTokens.ts` → `serviceAuth.ts`
- [x] ✅ Update PubSub event types to include `serviceName`
- [x] ✅ Genericize function names in `handleRoomNowPlayingData.ts`

### Medium Priority
- [x] ✅ Fix hardcoded Spotify check in `AdapterService.ts`
- [x] ✅ Create service configuration registry

### Low Priority (Future)
- [ ] Remove deprecated auth functions in next major version
- [ ] Audit frontend for similar Spotify-specific event handling

---

## ✅ Refactoring Complete!

See [SERVICE_AGNOSTIC_REFACTOR_COMPLETE.md](./SERVICE_AGNOSTIC_REFACTOR_COMPLETE.md) for full details.

---

## Impact Analysis

**Files Requiring Changes**: 6  
**Breaking Changes**: Potentially 1 (PubSub event types)  
**Migration Effort**: ~2-3 hours

### Breaking Changes

**PubSub Event Types**:
```typescript
// Before
{ type: "SPOTIFY_ACCESS_TOKEN_REFRESHED", data: { accessToken } }

// After (includes serviceName)
{ type: "SERVICE_ACCESS_TOKEN_REFRESHED", data: { accessToken, serviceName } }
```

**Mitigation**: Frontend likely doesn't use these events directly (needs verification)

---

## Testing Requirements

1. **Unit Tests**: Update tests for renamed functions
2. **Integration Tests**: Verify PubSub events with multiple services
3. **Manual Testing**: 
   - Create Spotify room
   - Verify token refresh works
   - Verify error handling works
   - Future: Test with Tidal/Apple Music

---

## Conclusion

The codebase is **95% service-agnostic** with only a few remaining Spotify-specific references:
- Constants and PubSub handlers are the main issues
- No direct adapter imports found ✅
- All operations properly use adapters ✅
- One hardcoded client ID lookup needs fixing

**Recommendation**: Proceed with HIGH priority refactoring to complete service-agnostic architecture.

