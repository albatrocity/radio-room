# Dependency Injection Refactor - Breaking Circular Dependencies

## Problem

The adapter packages (`@repo/adapter-spotify`) were importing directly from the server package (`@repo/server`), creating circular dependencies:

```typescript
// ❌ CIRCULAR DEPENDENCY
// adapter-spotify/lib/jukeboxJob.ts
import { getUserServiceAuth } from "../../../server/operations/data/serviceAuthentications"

// adapter-spotify/lib/serviceAuth.ts
import {
  getUserServiceAuth,
  deleteUserServiceAuth,
  storeUserServiceAuth,
} from "@repo/server/operations/data/serviceAuthentications"
```

**Why this is bad:**
- Violates dependency inversion principle
- Creates tight coupling between packages
- Makes adapters non-portable
- Prevents adapter packages from being truly modular

## Solution

Inject data operations through the `AppContext` instead of importing directly from server package.

## Architecture

### Dependency Flow (Before) ❌

```
@repo/server
    ↓ imports
@repo/adapter-spotify
    ↓ imports back (CIRCULAR!)
@repo/server/operations/data/serviceAuthentications
```

### Dependency Flow (After) ✅

```
@repo/server
    ↓ creates context with data operations
AppContext (with data property)
    ↓ passed to adapters
@repo/adapter-spotify
    ↓ uses context.data.* methods
No imports from @repo/server needed!
```

## Implementation

### 1. Added Data Operations to AppContext

**File:** `packages/types/AppContext.ts`

Added a `data` property that provides data access operations:

```typescript
export interface AppContext {
  redis: RedisContext
  adapters: AdapterRegistry
  jobs: JobRegistration[]
  jobService?: {
    scheduleJob: (job: JobRegistration) => Promise<void>
    disableJob: (jobName: string) => void
    stop: () => Promise<void>
  }
  data?: {
    getUserServiceAuth: (params: {
      userId: string
      serviceName: string
    }) => Promise<ServiceAuthenticationTokens | null>
    storeUserServiceAuth: (params: {
      userId: string
      serviceName: string
      tokens: ServiceAuthenticationTokens
    }) => Promise<void>
    deleteUserServiceAuth: (params: {
      userId: string
      serviceName: string
    }) => Promise<void>
  }
}
```

### 2. Populated Data Operations in Context Creation

**File:** `packages/server/lib/context.ts`

The server creates the context and injects the implementations:

```typescript
import {
  getUserServiceAuth,
  storeUserServiceAuth,
  deleteUserServiceAuth,
} from "../operations/data/serviceAuthentications"

export function createAppContext(redisUrl: string): AppContext {
  const context: AppContext = {
    redis: createRedisContext(redisUrl),
    adapters: {
      playbackControllers: new Map(),
      metadataSources: new Map(),
      mediaSources: new Map(),
      serviceAuth: new Map(),
      playbackControllerModules: new Map(),
      metadataSourceModules: new Map(),
      mediaSourceModules: new Map(),
    },
    jobs: [],
    data: {
      getUserServiceAuth: async ({ userId, serviceName }) => {
        return getUserServiceAuth({ context, userId, serviceName })
      },
      storeUserServiceAuth: async ({ userId, serviceName, tokens }) => {
        return storeUserServiceAuth({ context, userId, serviceName, tokens })
      },
      deleteUserServiceAuth: async ({ userId, serviceName }) => {
        return deleteUserServiceAuth({ context, userId, serviceName })
      },
    },
  }
  return context
}
```

**Key insight:** The implementations still live in `@repo/server`, but they're injected into context at runtime, not imported by adapters at build time.

### 3. Updated Jukebox Job to Use Context

**File:** `packages/adapter-spotify/lib/jukeboxJob.ts`

**Before:** ❌
```typescript
import { getUserServiceAuth } from "../../../server/operations/data/serviceAuthentications"

// ... later in handler
const auth = await getUserServiceAuth({
  context,
  userId,
  serviceName: "spotify",
})
```

**After:** ✅
```typescript
// No import needed!

// ... later in handler
if (!context.data?.getUserServiceAuth) {
  console.error("getUserServiceAuth not available in context")
  return
}

const auth = await context.data.getUserServiceAuth({
  userId,
  serviceName: "spotify",
})
```

### 4. Updated Service Auth Adapter to Use Context

**File:** `packages/adapter-spotify/lib/serviceAuth.ts`

**Before:** ❌
```typescript
import {
  getUserServiceAuth,
  deleteUserServiceAuth,
  storeUserServiceAuth,
} from "@repo/server/operations/data/serviceAuthentications"

async getAuthStatus(userId: string) {
  const auth = await getUserServiceAuth({
    context,
    userId,
    serviceName: "spotify",
  })
  // ...
}
```

**After:** ✅
```typescript
// No imports needed!

async getAuthStatus(userId: string) {
  if (!context.data?.getUserServiceAuth) {
    return {
      isAuthenticated: false,
      serviceName: "spotify",
      error: "getUserServiceAuth not available in context",
    }
  }

  const auth = await context.data.getUserServiceAuth({
    userId,
    serviceName: "spotify",
  })
  // ...
}
```

## Benefits

### 1. No Circular Dependencies ✅
- Adapters never import from server
- Clean, unidirectional dependency flow
- Server → Adapters (via context)

### 2. True Modularity ✅
- Adapters are self-contained
- Can be moved to separate npm packages
- No knowledge of server internals

### 3. Testability ✅
- Easy to mock `context.data.*` in tests
- No need to mock entire server modules
- Clear contract via TypeScript interface

### 4. Flexibility ✅
- Can swap implementations at runtime
- Different implementations for test vs. production
- Easy to add new data operations

## Dependency Inversion Principle

This follows the **Dependency Inversion Principle** from SOLID:

> High-level modules should not depend on low-level modules. Both should depend on abstractions.

**Before:**
- High-level: Spotify Adapter
- Low-level: Server Data Operations
- Problem: Adapter directly imports/depends on server ❌

**After:**
- High-level: Spotify Adapter
- Abstraction: `AppContext.data` interface
- Low-level: Server Data Operations
- Solution: Both depend on the abstraction ✅

## Testing Impact

### Before (Mocking Was Hard)

```typescript
// Had to mock the entire module
vi.mock("@repo/server/operations/data/serviceAuthentications", () => ({
  getUserServiceAuth: vi.fn(),
  storeUserServiceAuth: vi.fn(),
  deleteUserServiceAuth: vi.fn(),
}))
```

### After (Mocking Is Easy)

```typescript
// Just provide a mock context
const mockContext: AppContext = {
  data: {
    getUserServiceAuth: vi.fn(),
    storeUserServiceAuth: vi.fn(),
    deleteUserServiceAuth: vi.fn(),
  },
  // ... other context properties
}

const job = createJukeboxPollingJob({ context: mockContext, ... })
```

## Package Dependencies

### Before ❌

```
@repo/adapter-spotify
  dependencies:
    - @repo/types
    - @repo/server  ← BAD: Circular dependency
```

### After ✅

```
@repo/adapter-spotify
  dependencies:
    - @repo/types  ← Only depends on types!
```

The adapter package now only depends on types, making it truly modular.

## Runtime Flow

```
1. Server starts
   ↓
2. createAppContext() called
   ↓
3. Context created with data operations injected
   ↓
4. Adapter registered with context passed in
   ↓
5. Adapter uses context.data.* methods
   ↓
6. Methods execute server operations
   ↓
7. No imports from @repo/server needed! ✅
```

## Adding New Data Operations

To add a new data operation:

### 1. Add to AppContext interface

```typescript
// packages/types/AppContext.ts
export interface AppContext {
  data?: {
    getUserServiceAuth: (...) => Promise<...>
    // ✅ Add new operation
    getRoomSettings: (roomId: string) => Promise<RoomSettings>
  }
}
```

### 2. Implement in server

```typescript
// packages/server/operations/data/rooms.ts
export async function getRoomSettings({ context, roomId }) {
  // Implementation
}
```

### 3. Inject in context creation

```typescript
// packages/server/lib/context.ts
export function createAppContext(redisUrl: string): AppContext {
  const context: AppContext = {
    // ...
    data: {
      getUserServiceAuth: async ({ userId, serviceName }) => {
        return getUserServiceAuth({ context, userId, serviceName })
      },
      // ✅ Inject new operation
      getRoomSettings: async (roomId) => {
        return getRoomSettings({ context, roomId })
      },
    },
  }
  return context
}
```

### 4. Use in adapter

```typescript
// packages/adapter-spotify/lib/someAdapter.ts
const settings = await context.data?.getRoomSettings(roomId)
```

## Error Handling

All adapter code checks if operations are available:

```typescript
if (!context.data?.getUserServiceAuth) {
  console.error("getUserServiceAuth not available in context")
  return // or throw error
}

const auth = await context.data.getUserServiceAuth({ userId, serviceName })
```

This prevents runtime errors if context is not properly initialized.

## Future Improvements

### 1. Type-Safe Injection

Use a dependency injection container:

```typescript
// packages/server/lib/di.ts
export class DependencyContainer {
  register<T>(key: string, impl: T): void
  resolve<T>(key: string): T
}

// In context
const di = new DependencyContainer()
di.register("getUserServiceAuth", getUserServiceAuth)

// In adapter
const fn = context.di.resolve<GetUserServiceAuth>("getUserServiceAuth")
```

### 2. Separate Data Package

Create `@repo/data-operations` package:

```
@repo/data-operations
  - interface definitions
  - Redis implementation
  - Memory implementation (for tests)
  - Other implementations

@repo/server
  - imports @repo/data-operations
  - uses Redis implementation

@repo/adapter-spotify
  - depends on @repo/types only
  - uses context.data.*
```

### 3. Plugin System

Make data operations pluggable:

```typescript
export interface DataPlugin {
  name: string
  operations: Record<string, Function>
}

const redisDataPlugin: DataPlugin = {
  name: "redis-data",
  operations: {
    getUserServiceAuth,
    storeUserServiceAuth,
    deleteUserServiceAuth,
  },
}

context.use(redisDataPlugin)
```

## Related Files

### Modified:
- ✅ `packages/types/AppContext.ts` - Added data operations interface
- ✅ `packages/server/lib/context.ts` - Injected data operations
- ✅ `packages/adapter-spotify/lib/jukeboxJob.ts` - Removed server import, use context
- ✅ `packages/adapter-spotify/lib/serviceAuth.ts` - Removed server import, use context

### Unchanged:
- `packages/server/operations/data/serviceAuthentications.ts` - Implementations stay in server
- `packages/adapter-spotify/lib/operations/*` - Other adapter operations

## Summary

**Before:** ❌
- Circular dependencies between packages
- Adapters tightly coupled to server
- Hard to test in isolation
- Not truly modular

**After:** ✅
- Clean dependency flow (server → adapters)
- Adapters depend only on types
- Easy to test with mock context
- Truly modular and portable

**Pattern:** Dependency Injection via Context
**Principle:** Dependency Inversion (SOLID)
**Result:** Maintainable, testable, modular architecture 🎉

