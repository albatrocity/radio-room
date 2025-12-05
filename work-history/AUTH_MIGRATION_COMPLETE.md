# Authentication Migration Complete ✅

## Summary

Successfully migrated the authentication system to use a **scalable, adapter-based pattern** that works with any music service. The system now separates service-specific OAuth flows from generic authentication operations.

## What Was Built

### 1. Service Authentication Interface ✅

Created `ServiceAuthenticationAdapter` interface that all music services implement:

```typescript
export type ServiceAuthenticationAdapter = {
  serviceName: string
  getAuthStatus: (userId: string) => Promise<ServiceAuthenticationStatus>
  logout: (userId: string) => Promise<void>
  refreshAuth?: (userId: string) => Promise<ServiceAuthenticationTokens>
}
```

**Location:** `packages/types/ServiceAuthentication.ts`

### 2. Spotify Service Auth Adapter ✅

Implemented the first service auth adapter for Spotify:

```typescript
export function createSpotifyServiceAuthAdapter(context: AppContext): ServiceAuthenticationAdapter {
  return {
    serviceName: "spotify",
    async getAuthStatus(userId: string) { /* ... */ },
    async logout(userId: string) { /* ... */ },
    async refreshAuth(userId: string) { /* ... */ }
  }
}
```

**Location:** `packages/adapter-spotify/lib/serviceAuth.ts`

### 3. Generic Auth Service Methods ✅

Updated `AuthService` to use registered adapters:

**Before:**
```typescript
async getUserSpotifyAuth(userId: string) {
  // Hard-coded Spotify logic
  const accessToken = "dummy-access-token"
  return { isAuthenticated: !!accessToken, accessToken }
}
```

**After:**
```typescript
async getUserServiceAuth(userId: string, serviceName: string) {
  const serviceAuthAdapter = this.context.adapters.serviceAuth.get(serviceName)
  
  if (!serviceAuthAdapter) {
    return { isAuthenticated: false, serviceName, error: "Service not found" }
  }
  
  return await serviceAuthAdapter.getAuthStatus(userId)
}

async logoutServiceAuth(userId: string, serviceName: string) {
  const serviceAuthAdapter = this.context.adapters.serviceAuth.get(serviceName)
  await serviceAuthAdapter.logout(userId)
  return { success: true }
}
```

**Location:** `packages/server/services/AuthService.ts`

### 4. Generic Socket Event Handlers ✅

Added generic handlers that work with any service:

**New Events:**
```typescript
// Get auth status for any service
socket.on("get user service authentication status", ({ userId, serviceName }) => {
  getUserServiceAuth({ socket, io }, { userId, serviceName })
})

// Logout from any service
socket.on("logout service", ({ userId, serviceName }) => {
  logoutServiceAuth({ socket, io }, { userId, serviceName })
})
```

**Backward Compatible:**
```typescript
// Old Spotify-specific events still work
socket.on("get user spotify authentication status", ({ userId }) => {
  getUserSpotifyAuth({ socket, io }, { userId })
})

socket.on("logout spotify", ({ userId }) => {
  logoutSpotifyAuth({ socket, io }, { userId })
})
```

**Location:** `packages/server/controllers/authController.ts`

### 5. Updated AppContext ✅

Added `serviceAuth` registry to `AppContext`:

```typescript
export interface AdapterRegistry {
  playbackControllers: Map<string, PlaybackController>
  metadataSources: Map<string, MetadataSource>
  mediaSources: Map<string, MediaSource>
  serviceAuth: Map<string, ServiceAuthenticationAdapter>  // ← New!
}
```

**Location:** `packages/types/AppContext.ts`

### 6. Server Registration ✅

Updated server to register Spotify service auth:

```typescript
// apps/api/src/server.ts
const spotifyServiceAuth = createSpotifyServiceAuthAdapter(context)
context.adapters.serviceAuth.set("spotify", spotifyServiceAuth)
```

## Key Benefits

### 1. **Service-Agnostic Authentication**
Works with Spotify, Tidal, Apple Music, or any OAuth-based service:

```typescript
// Check Spotify auth
socket.emit("get user service authentication status", {
  userId: "user123",
  serviceName: "spotify"
})

// Check Tidal auth
socket.emit("get user service authentication status", {
  userId: "user123",
  serviceName: "tidal"
})
```

### 2. **Clean Separation of Concerns**

```
Adapter Package (adapter-spotify/)
  ├── OAuth Routes (lib/authRoutes.ts)
  ├── Service Auth Adapter (lib/serviceAuth.ts)
  ├── Playback Controller
  └── Metadata Source

Server Package (server/)
  ├── Auth Service (generic operations)
  ├── Auth Handlers (socket event handlers)
  └── Auth Controller (socket event registration)
```

### 3. **Backward Compatibility**
Old clients using Spotify-specific events continue to work without changes.

### 4. **Type Safety**
All service auth operations are type-safe through the `ServiceAuthenticationAdapter` interface.

### 5. **Easy Testing**
Mock service auth adapters can be injected for testing.

## OAuth Flow (Scalable Pattern)

### 1. User Initiates OAuth
```
User clicks "Connect Spotify" → Browser redirects to /auth/spotify/login
```

### 2. Service-Specific OAuth Routes (In Adapter)
```typescript
// packages/adapter-spotify/lib/authRoutes.ts
router.get("/login", (req, res) => {
  // Redirect to Spotify OAuth
  res.redirect("https://accounts.spotify.com/authorize?...")
})

router.get("/callback", async (req, res) => {
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code)
  
  // Store using GENERIC operation
  await storeUserServiceAuth({
    context,
    userId,
    serviceName: "spotify",  // ← Service-specific identifier
    tokens: { accessToken, refreshToken, expiresAt }
  })
  
  res.redirect(APP_URL + "?toast=Spotify authentication successful")
})
```

### 3. Generic Token Storage
```
Redis key: user:{userId}:auth:spotify
Redis key: user:{userId}:auth:tidal
Redis key: user:{userId}:auth:apple-music
```

### 4. Service Auth Adapter (In Adapter)
```typescript
// packages/adapter-spotify/lib/serviceAuth.ts
export function createSpotifyServiceAuthAdapter(context) {
  return {
    serviceName: "spotify",
    
    async getAuthStatus(userId) {
      // Use GENERIC retrieval
      const auth = await getUserServiceAuth({ context, userId, serviceName: "spotify" })
      return {
        isAuthenticated: !!auth?.tokens?.accessToken,
        accessToken: auth?.tokens?.accessToken,
        serviceName: "spotify"
      }
    },
    
    async logout(userId) {
      // Use GENERIC deletion
      await deleteUserServiceAuth({ context, userId, serviceName: "spotify" })
    }
  }
}
```

### 5. Generic Server Operations (In Server)
```typescript
// packages/server/services/AuthService.ts
async getUserServiceAuth(userId: string, serviceName: string) {
  // Get the registered adapter
  const adapter = this.context.adapters.serviceAuth.get(serviceName)
  
  // Use the adapter
  return await adapter.getAuthStatus(userId)
}
```

## Adding a New Service (Example: Tidal)

### Step 1: Create Auth Routes
```typescript
// packages/adapter-tidal/lib/authRoutes.ts
export function createTidalAuthRoutes(context: AppContext) {
  const router = Router()
  
  router.get("/login", (req, res) => {
    res.redirect("https://auth.tidal.com/authorize?...")
  })
  
  router.get("/callback", async (req, res) => {
    const tokens = await exchangeTidalCodeForTokens(code)
    
    await storeUserServiceAuth({
      context,
      userId,
      serviceName: "tidal",  // ← Different service name
      tokens
    })
    
    res.redirect(APP_URL)
  })
  
  return router
}
```

### Step 2: Create Service Auth Adapter
```typescript
// packages/adapter-tidal/lib/serviceAuth.ts
export function createTidalServiceAuthAdapter(context: AppContext) {
  return {
    serviceName: "tidal",
    
    async getAuthStatus(userId) {
      const auth = await getUserServiceAuth({ context, userId, serviceName: "tidal" })
      return {
        isAuthenticated: !!auth?.tokens?.accessToken,
        accessToken: auth?.tokens?.accessToken,
        serviceName: "tidal"
      }
    },
    
    async logout(userId) {
      await deleteUserServiceAuth({ context, userId, serviceName: "tidal" })
    }
  }
}
```

### Step 3: Register in Server
```typescript
// apps/api/src/server.ts
import { createTidalAuthRoutes, createTidalServiceAuthAdapter } from "@repo/adapter-tidal"

const tidalServiceAuth = createTidalServiceAuthAdapter(context)
context.adapters.serviceAuth.set("tidal", tidalServiceAuth)

const tidalAuthRouter = createTidalAuthRoutes(context)
server.mountRoutes("/auth/tidal", tidalAuthRouter)
```

### Step 4: Client Usage
```typescript
// Same API for all services!
socket.emit("get user service authentication status", {
  userId: "user123",
  serviceName: "tidal"  // ← Just change the service name
})
```

## Files Modified

### New Files
- ✅ `packages/types/ServiceAuthentication.ts` - Generic auth interface
- ✅ `packages/adapter-spotify/lib/serviceAuth.ts` - Spotify auth adapter
- ✅ `SERVICE_AUTHENTICATION_PATTERN.md` - Comprehensive documentation

### Modified Files
- ✅ `packages/types/index.ts` - Export ServiceAuthentication types
- ✅ `packages/types/AppContext.ts` - Added serviceAuth registry
- ✅ `packages/adapter-spotify/index.ts` - Export service auth adapter
- ✅ `packages/server/services/AuthService.ts` - Generic auth methods
- ✅ `packages/server/handlers/authHandlers.ts` - Generic handlers
- ✅ `packages/server/handlers/authHandlersAdapter.ts` - Generic handlers
- ✅ `packages/server/controllers/authController.ts` - Generic events
- ✅ `packages/server/lib/context.ts` - Initialize serviceAuth map
- ✅ `packages/factories/appContext.ts` - Include serviceAuth in factory
- ✅ `apps/api/src/server.ts` - Register Spotify service auth

## Socket Events

### New Generic Events (Recommended)

```typescript
// Get auth status for any service
socket.emit("get user service authentication status", {
  userId: string,
  serviceName: string  // "spotify", "tidal", "apple-music", etc.
})

socket.on("event", (event) => {
  if (event.type === "SERVICE_AUTHENTICATION_STATUS") {
    const { isAuthenticated, accessToken, serviceName } = event.data
  }
})

// Logout from any service
socket.emit("logout service", {
  userId: string,
  serviceName: string
})

socket.on("event", (event) => {
  if (event.type === "SERVICE_LOGOUT_SUCCESS") {
    const { serviceName } = event.data
  }
  if (event.type === "SERVICE_LOGOUT_FAILURE") {
    const { serviceName, error } = event.data
  }
})
```

### Deprecated Events (Still Supported)

```typescript
// Old Spotify-specific events (for backward compatibility)
socket.emit("get user spotify authentication status", { userId })
socket.emit("logout spotify", { userId })
```

## Testing

All existing tests pass. The deprecated methods are marked with `@deprecated` JSDoc tags but continue to work.

## Migration Path for Frontend

### Phase 1: Backend Ready (Complete ✅)
Backend now supports both old and new events.

### Phase 2: Frontend Migration (Optional)
Update frontend to use generic events:

```typescript
// Before
socket.emit("get user spotify authentication status", { userId })

// After
socket.emit("get user service authentication status", { 
  userId, 
  serviceName: "spotify" 
})
```

### Phase 3: Deprecation (Future)
After all clients are updated, remove deprecated events.

## Conclusion

The authentication system is now **fully scalable and service-agnostic**! 

**To add a new music service:**
1. Create OAuth routes in adapter package
2. Implement service auth adapter
3. Register in server
4. Done! ✨

The pattern maintains backward compatibility while providing a clean, generic interface for all current and future music services.

**Next Steps:**
- Add Tidal authentication (use the pattern!)
- Add Apple Music authentication (use the pattern!)
- Update frontend to use generic events (optional)

