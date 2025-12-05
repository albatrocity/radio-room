# Service Authentication Pattern

## Overview

The Radio Room server now uses a **scalable, adapter-based authentication pattern** that works with any music service (Spotify, Tidal, Apple Music, etc.). This pattern separates service-specific OAuth flows from the generic authentication operations.

## Architecture

### 1. Service Authentication Adapter Interface

Each service implements the `ServiceAuthenticationAdapter` interface:

```typescript
export type ServiceAuthenticationAdapter = {
  serviceName: string
  getAuthStatus: (userId: string) => Promise<ServiceAuthenticationStatus>
  logout: (userId: string) => Promise<void>
  refreshAuth?: (userId: string) => Promise<ServiceAuthenticationTokens>
}
```

### 2. OAuth Routes (Service-Specific)

Each adapter package handles its own OAuth flow:

**Location:** `packages/adapter-{service}/lib/authRoutes.ts`

**Example:** Spotify
```typescript
// packages/adapter-spotify/lib/authRoutes.ts
export function createSpotifyAuthRoutes(context: AppContext) {
  const router = Router()
  
  router.get("/login", async (req, res) => {
    // Redirect to Spotify OAuth
  })
  
  router.get("/callback", async (req, res) => {
    // Handle OAuth callback
    // Store tokens using generic storeUserServiceAuth
    await storeUserServiceAuth({
      context,
      userId,
      serviceName: "spotify",
      tokens: { accessToken, refreshToken, expiresAt }
    })
  })
  
  return router
}
```

### 3. Service Authentication Adapter (Service-Specific)

Each adapter implements the auth interface:

**Location:** `packages/adapter-{service}/lib/serviceAuth.ts`

**Example:** Spotify
```typescript
// packages/adapter-spotify/lib/serviceAuth.ts
export function createSpotifyServiceAuthAdapter(context: AppContext): ServiceAuthenticationAdapter {
  return {
    serviceName: "spotify",
    
    async getAuthStatus(userId: string) {
      const auth = await getUserServiceAuth({ context, userId, serviceName: "spotify" })
      return {
        isAuthenticated: !!auth?.tokens?.accessToken,
        accessToken: auth?.tokens?.accessToken,
        serviceName: "spotify"
      }
    },
    
    async logout(userId: string) {
      await deleteUserServiceAuth({ context, userId, serviceName: "spotify" })
    },
    
    async refreshAuth(userId: string) {
      // Call Spotify token refresh endpoint
    }
  }
}
```

### 4. Generic Auth Service (Server)

The server's `AuthService` uses registered adapters:

```typescript
// packages/server/services/AuthService.ts
async getUserServiceAuth(userId: string, serviceName: string) {
  const serviceAuthAdapter = this.context.adapters.serviceAuth.get(serviceName)
  
  if (!serviceAuthAdapter) {
    return { isAuthenticated: false, serviceName, error: "Service not found" }
  }
  
  return await serviceAuthAdapter.getAuthStatus(userId)
}

async logoutServiceAuth(userId: string, serviceName: string) {
  const serviceAuthAdapter = this.context.adapters.serviceAuth.get(serviceName)
  
  if (!serviceAuthAdapter) {
    return { success: false, error: "Service not found" }
  }
  
  await serviceAuthAdapter.logout(userId)
  return { success: true }
}
```

### 5. Socket Events (Generic)

The auth controller handles generic events:

```typescript
// packages/server/controllers/authController.ts

// Generic events (recommended for new clients)
socket.on("get user service authentication status", ({ userId, serviceName }) => {
  getUserServiceAuth({ socket, io }, { userId, serviceName })
})

socket.on("logout service", ({ userId, serviceName }) => {
  logoutServiceAuth({ socket, io }, { userId, serviceName })
})

// Deprecated events (maintained for backward compatibility)
socket.on("get user spotify authentication status", ({ userId }) => {
  getUserSpotifyAuth({ socket, io }, { userId })
})

socket.on("logout spotify", ({ userId }) => {
  logoutSpotifyAuth({ socket, io }, { userId })
})
```

## Adding a New Music Service

### Example: Adding Tidal

#### 1. Create Adapter Package

```bash
mkdir -p packages/adapter-tidal/lib
```

#### 2. Implement OAuth Routes

```typescript
// packages/adapter-tidal/lib/authRoutes.ts
import { Router } from "express"
import { AppContext } from "@repo/types"
import { storeUserServiceAuth } from "@repo/server/operations/data/serviceAuthentications"

export function createTidalAuthRoutes(context: AppContext) {
  const router = Router()
  
  router.get("/login", async (req, res) => {
    // Redirect to Tidal OAuth
    const authUrl = `https://auth.tidal.com/authorize?...`
    res.redirect(authUrl)
  })
  
  router.get("/callback", async (req, res) => {
    const code = req.query.code
    
    // Exchange code for tokens
    const tokens = await exchangeTidalCodeForTokens(code)
    
    // Get user info
    const userInfo = await getTidalUserInfo(tokens.accessToken)
    
    // Store tokens
    await storeUserServiceAuth({
      context,
      userId: userInfo.id,
      serviceName: "tidal",
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000
      }
    })
    
    res.redirect(`${process.env.APP_URL}?toast=Tidal authentication successful`)
  })
  
  return router
}
```

#### 3. Implement Service Auth Adapter

```typescript
// packages/adapter-tidal/lib/serviceAuth.ts
import { ServiceAuthenticationAdapter } from "@repo/types"
import { getUserServiceAuth, deleteUserServiceAuth } from "@repo/server/operations/data/serviceAuthentications"

export function createTidalServiceAuthAdapter(context: AppContext): ServiceAuthenticationAdapter {
  return {
    serviceName: "tidal",
    
    async getAuthStatus(userId: string) {
      const auth = await getUserServiceAuth({ context, userId, serviceName: "tidal" })
      
      return {
        isAuthenticated: !!auth?.tokens?.accessToken,
        accessToken: auth?.tokens?.accessToken,
        serviceName: "tidal"
      }
    },
    
    async logout(userId: string) {
      await deleteUserServiceAuth({ context, userId, serviceName: "tidal" })
    },
    
    async refreshAuth(userId: string) {
      const auth = await getUserServiceAuth({ context, userId, serviceName: "tidal" })
      
      // Call Tidal token refresh API
      const newTokens = await refreshTidalTokens(auth.tokens.refreshToken)
      
      // Store new tokens
      await storeUserServiceAuth({
        context,
        userId,
        serviceName: "tidal",
        tokens: newTokens
      })
      
      return newTokens
    }
  }
}
```

#### 4. Export from Adapter Package

```typescript
// packages/adapter-tidal/index.ts
export { createTidalAuthRoutes } from "./lib/authRoutes"
export { createTidalServiceAuthAdapter } from "./lib/serviceAuth"
export { playbackController } from "./lib/playbackController"
export { metadataSource } from "./lib/metadataSource"
```

#### 5. Register in Server

```typescript
// apps/api/src/server.ts
import {
  createTidalAuthRoutes,
  createTidalServiceAuthAdapter,
  playbackController as tidalPlayback,
  metadataSource as tidalMetadata
} from "@repo/adapter-tidal"

async function main() {
  const server = createServer({ /* ... */ })
  const context = server.getContext()
  
  // Register Tidal service auth
  const tidalServiceAuth = createTidalServiceAuthAdapter(context)
  context.adapters.serviceAuth.set("tidal", tidalServiceAuth)
  
  // Mount Tidal OAuth routes
  const tidalAuthRouter = createTidalAuthRoutes(context)
  server.mountRoutes("/auth/tidal", tidalAuthRouter)
  
  // Register Tidal adapters
  await tidalPlayback.register({ /* ... */ })
  await tidalMetadata.register({ /* ... */ })
  
  await server.start()
}
```

## Client Usage

### Frontend Authentication Flow

#### 1. Start OAuth Flow

```typescript
// User clicks "Connect Tidal" button
window.location.href = "http://localhost:3000/auth/tidal/login"
```

#### 2. Check Auth Status

```typescript
// Generic approach (recommended)
socket.emit("get user service authentication status", {
  userId: currentUser.id,
  serviceName: "tidal"
})

socket.on("event", (event) => {
  if (event.type === "SERVICE_AUTHENTICATION_STATUS") {
    const { isAuthenticated, accessToken, serviceName } = event.data
    console.log(`${serviceName} auth status:`, isAuthenticated)
  }
})
```

#### 3. Logout from Service

```typescript
// Generic approach (recommended)
socket.emit("logout service", {
  userId: currentUser.id,
  serviceName: "tidal"
})

socket.on("event", (event) => {
  if (event.type === "SERVICE_LOGOUT_SUCCESS") {
    console.log(`Logged out from ${event.data.serviceName}`)
  }
})
```

### Backward Compatibility

Old clients can still use Spotify-specific events:

```typescript
// Old approach (deprecated but still works)
socket.emit("get user spotify authentication status", {
  userId: currentUser.id
})

socket.on("event", (event) => {
  if (event.type === "SPOTIFY_AUTHENTICATION_STATUS") {
    const { isAuthenticated, accessToken } = event.data
  }
})
```

## Benefits of This Pattern

### 1. **Service-Agnostic**
Add new music services without changing server core code.

### 2. **Adapter Isolation**
Each service manages its own OAuth flow and token storage.

### 3. **Type-Safe**
TypeScript interfaces ensure consistency across all adapters.

### 4. **Backward Compatible**
Old clients continue to work while new clients use generic events.

### 5. **Centralized Auth Storage**
All services use the same Redis storage pattern:
```
user:{userId}:auth:{serviceName} -> { tokens, metadata }
```

### 6. **Easy Testing**
Mock service auth adapters for testing without real OAuth flows.

## Data Storage

### Token Storage Format

```typescript
// Redis key: user:{userId}:auth:{serviceName}
{
  tokens: {
    accessToken: string
    refreshToken: string
    expiresAt: number  // Unix timestamp
  },
  metadata: {
    userId: string      // Service-specific user ID
    username?: string
    email?: string
  }
}
```

### Operations

```typescript
// Store auth
await storeUserServiceAuth({
  context,
  userId: "user123",
  serviceName: "spotify",
  tokens: { accessToken, refreshToken, expiresAt }
})

// Retrieve auth
const auth = await getUserServiceAuth({
  context,
  userId: "user123",
  serviceName: "spotify"
})

// Delete auth
await deleteUserServiceAuth({
  context,
  userId: "user123",
  serviceName: "spotify"
})
```

## Summary

This scalable authentication pattern allows Radio Room to support **any music service** with OAuth authentication. Each service is a self-contained adapter that implements a common interface, making it easy to add new services without modifying core server code.

**To add a new service:**
1. Create adapter package with OAuth routes
2. Implement service auth adapter
3. Register in server
4. Done! ✨

The pattern maintains backward compatibility with existing Spotify-specific events while providing a clean, generic interface for future services.

