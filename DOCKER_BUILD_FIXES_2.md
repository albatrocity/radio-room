# Docker Build Fixes - Round 2

## Issues Fixed

### 1. Missing Type Declarations
- **Problem**: Missing `@types` packages for TypeScript compilation
- **Fix**: Added missing dev dependencies to `packages/server/package.json`:
  - `@types/cookie-parser`
  - `@types/cors`
  - `@types/express`
  - `@types/express-session`
  - `@types/mustache`
  - `@types/node-cron`

### 2. Missing Runtime Dependencies
- **Problem**: Packages like `redis`, `remeda`, and `mustache` were missing from `@repo/server`
- **Fix**: Added to `packages/server/package.json` dependencies:
  - `redis`: "^4.7.0"
  - `remeda`: "^2.26.0"
  - `mustache`: "^4.2.0"

### 3. PlaybackControllerLifecycleCallbacks Type Error
- **Problem**: `PlaybackControllerLifecycleCallbacks` was missing `name` and `authentication` properties
- **Fix**: Updated `packages/types/PlaybackController.ts` to include:
  ```typescript
  export type PlaybackControllerLifecycleCallbacks = {
    name: string
    authentication: AdapterAuthentication
    // ... other callbacks
  }
  ```

### 4. Spotify Adapter Type Errors
- **Problem**: Adapter implementations were using wrong parameter types
- **Fixes**:
  - Updated `packages/adapter-spotify/lib/playbackControllerApi.ts` to use `PlaybackControllerLifecycleCallbacks`
  - Updated `packages/adapter-spotify/lib/metadataSourceApi.ts` to use `MetadataSourceLifecycleCallbacks`
  - Fixed `metadataSourceApi.ts` to call `onAuthenticationCompleted()` without parameters
  - Updated `packages/adapter-spotify/index.ts` to properly type the register functions

### 5. Spotify API Config Type Union
- **Problem**: `getSpotifyApi` couldn't handle multiple config types
- **Fix**: Created a union type in `packages/adapter-spotify/lib/spotifyApi.ts`:
  ```typescript
  type SpotifyApiConfig =
    | PlaybackControllerLifecycleCallbacks
    | MetadataSourceAdapterConfig
    | AdapterConfig
  ```

### 6. Auth Routes Token Response Type
- **Problem**: `tokenData` from Spotify OAuth had `unknown` type
- **Fix**: Added type assertion in `packages/adapter-spotify/lib/authRoutes.ts`:
  ```typescript
  const tokenData = (await tokenResponse.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
    scope: string
  }
  ```

### 7. Auth Routes Import Path
- **Problem**: Incorrect import path for `storeUserServiceAuth`
- **Fix**: Changed from relative path `../../../server/operations/data/serviceAuthentications` to workspace alias `@repo/server/operations/data/serviceAuthentications`

### 8. node-cron Type Error
- **Problem**: `cron.ScheduledTask` namespace not found
- **Fix**: Changed import and type in `packages/server/services/JobService.ts`:
  ```typescript
  import * as cron from "node-cron"
  private scheduledJobs: Map<string, ReturnType<typeof cron.schedule>> = new Map()
  ```

### 9. node-cron `scheduled` Option Removed
- **Problem**: `scheduled: true` option no longer exists in node-cron
- **Fix**: Simplified scheduling in `JobService.ts`:
  ```typescript
  const task = cron.schedule(job.cron, async () => { /* ... */ })
  task.start()
  ```

### 10. Server registerPlaybackController Missing Fields
- **Problem**: Callback passed to adapter didn't include `name` and `authentication`
- **Fix**: Added these fields in `packages/server/index.ts`:
  ```typescript
  playbackController.adapter.register({
    name: playbackController.name,
    authentication: playbackController.authentication,
    // ... other callbacks
  })
  ```

### 11. AppContext Factory Missing Fields
- **Problem**: Factory didn't create `adapters` and `jobs` fields
- **Fix**: Updated `packages/factories/appContext.ts`:
  ```typescript
  return {
    redis: redisContext,
    adapters: {
      playbackControllers: new Map(),
      metadataSources: new Map(),
      mediaSources: new Map(),
    },
    jobs: [],
  }
  ```

### 12. Spotify Auth Token Response Type
- **Problem**: `getSpotifyAuthTokens` returned `unknown`
- **Fix**: Added return type and export in `packages/adapter-spotify/lib/operations/getSpotifyAuthTokens.ts`:
  ```typescript
  export type SpotifyAuthTokenResponse = {
    access_token: string
    token_type: string
    scope: string
    expires_in: number
    refresh_token: string
  }
  ```

### 13. Missing Express Dependency in @adapter-spotify
- **Problem**: `@adapter-spotify` uses Express but didn't have it as a dependency
- **Fix**: Added to `packages/adapter-spotify/package.json`:
  - `dependencies`: `express: "^5.1.0"`, `@repo/server: "*"`
  - `devDependencies`: `@types/express: "^5.0.0"`

## Remaining Errors (to be fixed)

The build still has ~16 TypeScript errors related to:
1. Legacy code in existing server operations (`authController`, `djController`, etc.)
2. Missing `title` field in `QueueItem` type
3. `mediaSourceConfig` type mismatch (string vs object)
4. Import issues (`sendMessage.ts`, `getRoomPath`)
5. Function signature mismatches (`userChallenge.ts`)
6. Test code with `expect` in production files

These are mostly pre-existing issues in the old codebase that need to be addressed separately.

## Next Steps

1. Continue fixing remaining TypeScript errors
2. Ensure all local packages build successfully
3. Test Docker Compose stack with full environment variables

