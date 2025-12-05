# Controller Pattern Improvement Proposal

## Problem

The current controller pattern has several issues:

1. Repetitive passing of `{ socket, io }` to every handler
2. Two layers of thin wrapper functions (controller → handler → adapter)
3. Socket already contains reference to `io` via `socket.server`
4. More difficult to test due to repeated dependency passing

## Recommended Solution: Class-Based Controllers

### Pattern: Controller Class with Dependency Injection

```typescript
// packages/server/controllers/DJController.ts
import { Server } from "socket.io"
import { SocketWithContext } from "../lib/socketWithContext"
import { DJHandlers, createDJHandlers } from "../handlers/djHandlersAdapter"
import { User, QueueItem } from "@repo/types"

export class DJController {
  private socket: SocketWithContext
  private io: Server
  private djHandlers: DJHandlers

  constructor(socket: SocketWithContext, io: Server) {
    this.socket = socket
    this.io = io
    this.djHandlers = createDJHandlers(socket.context)
  }

  /**
   * Register all DJ-related socket event handlers
   */
  registerHandlers(): void {
    this.socket.on("dj deputize user", this.handleDeputizeUser)
    this.socket.on("queue song", this.handleQueueSong)
    this.socket.on("search track", this.handleSearchTrack)
    this.socket.on("search spotify track", this.handleSearchTrack) // backward compat
    this.socket.on("save playlist", this.handleSavePlaylist)
  }

  /**
   * Private handler methods - bound to instance, no need to pass socket/io
   */
  private handleDeputizeUser = async (userId: User["userId"]) => {
    await this.djHandlers.djDeputizeUser({ socket: this.socket, io: this.io }, userId)
  }

  private handleQueueSong = async (trackId: QueueItem["track"]["id"]) => {
    await this.djHandlers.queueSong({ socket: this.socket, io: this.io }, trackId)
  }

  private handleSearchTrack = async (query: { query: string }) => {
    await this.djHandlers.searchForTrack({ socket: this.socket, io: this.io }, query)
  }

  private handleSavePlaylist = async ({
    name,
    trackIds,
  }: {
    name: string
    trackIds: QueueItem["track"]["id"][]
  }) => {
    await this.djHandlers.savePlaylist({ socket: this.socket, io: this.io }, { name, trackIds })
  }
}

// Factory function for easy instantiation
export function createDJController(socket: SocketWithContext, io: Server): DJController {
  const controller = new DJController(socket, io)
  controller.registerHandlers()
  return controller
}
```

### Usage in Server

```typescript
// packages/server/index.ts
import { createDJController } from "./controllers/DJController"
import { createActivityController } from "./controllers/ActivityController"
import { createAuthController } from "./controllers/AuthController"

this.io.on("connection", (socket) => {
  const socketWithContext: SocketWithContext = Object.assign(socket, {
    context: this.context,
  })

  // Clean, simple controller instantiation
  createDJController(socketWithContext, this.io)
  createActivityController(socketWithContext, this.io)
  createAuthController(socketWithContext, this.io)
  // ...
})
```

## Benefits

### 1. **Less Repetition**

```typescript
// Before: Pass { socket, io } to every handler
socket.on("queue song", (trackId) => queueSong({ socket, io }, trackId))

// After: Socket and io bound to instance
private handleQueueSong = async (trackId) => {
  await this.djHandlers.queueSong({ socket: this.socket, io: this.io }, trackId)
}
```

### 2. **Better Encapsulation**

```typescript
class DJController {
  private socket: SocketWithContext // Private, encapsulated
  private io: Server // Private, encapsulated
  private djHandlers: DJHandlers // Reused across all handlers

  // Clear separation of public vs private methods
  registerHandlers(): void {
    /* public */
  }
  private handleQueueSong = async () => {
    /* private */
  }
}
```

### 3. **Easier Testing**

```typescript
// Test example
describe("DJController", () => {
  let controller: DJController
  let mockSocket: SocketWithContext
  let mockIo: Server
  let mockDJHandlers: DJHandlers

  beforeEach(() => {
    mockSocket = createMockSocket()
    mockIo = createMockIO()

    // Can easily inject mocks via constructor
    controller = new DJController(mockSocket, mockIo)

    // Or spy on the handlers
    vi.spyOn(controller["djHandlers"], "queueSong")
  })

  test("should handle queue song event", async () => {
    await controller["handleQueueSong"]("track123")

    expect(controller["djHandlers"].queueSong).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      "track123",
    )
  })
})
```

### 4. **Type Safety**

```typescript
// Methods are properly typed and checked at compile time
private handleQueueSong = async (trackId: QueueItem["track"]["id"]) => {
  // TypeScript ensures trackId is the correct type
}
```

### 5. **Better IDE Support**

- Autocomplete for private methods
- Jump to definition works perfectly
- Refactoring is safer and easier

## Alternative Pattern: Higher-Order Function

If you prefer functional style over classes:

```typescript
// packages/server/controllers/djController.ts
import { Server } from "socket.io"
import { SocketWithContext } from "../lib/socketWithContext"
import { createDJHandlers } from "../handlers/djHandlersAdapter"

export function createDJController(socket: SocketWithContext, io: Server) {
  // Create handler instance once, close over socket and io
  const djHandlers = createDJHandlers(socket.context)
  const connections = { socket, io }

  // Register handlers - socket and io are in closure
  socket.on("dj deputize user", (userId) => djHandlers.djDeputizeUser(connections, userId))

  socket.on("queue song", (trackId) => djHandlers.queueSong(connections, trackId))

  socket.on("search track", (query) => djHandlers.searchForTrack(connections, query))

  socket.on("save playlist", ({ name, trackIds }) =>
    djHandlers.savePlaylist(connections, { name, trackIds }),
  )

  // Return cleanup function if needed
  return () => {
    socket.removeAllListeners()
  }
}
```

**Benefits:**

- ✅ Simpler than classes (no `this` binding)
- ✅ Still avoids repetition
- ✅ Functional style
- ✅ Closure benefits

**Tradeoffs:**

- ❌ Harder to test individual handlers (they're not exposed)
- ❌ Less explicit than class methods

## Even Simpler: Remove Handler Layer

The current architecture has:

```
Controller → Handler → HandlerAdapter → Service
```

You could simplify to:

```
Controller → HandlerAdapter → Service
```

```typescript
export function createDJController(socket: SocketWithContext, io: Server) {
  const djHandlers = createDJHandlers(socket.context)
  const connections = { socket, io }

  // Register directly to adapter methods
  socket.on("queue song", (trackId) => djHandlers.queueSong(connections, trackId))

  // No need for intermediate handler functions!
}
```

This eliminates the thin wrapper functions in `handlers/djHandlers.ts` entirely.

## Comparison

| Pattern               | Repetition | Testability | Complexity | Functional Style |
| --------------------- | ---------- | ----------- | ---------- | ---------------- |
| **Current**           | High       | Medium      | Medium     | Yes              |
| **Class-Based**       | Low        | High        | Medium     | No               |
| **HOF with Closure**  | Low        | Medium      | Low        | Yes              |
| **Direct to Adapter** | Low        | High        | Low        | Yes              |

## Recommendation

### For Your Codebase:

**Option 1: Higher-Order Function with Direct Adapter Calls** (Recommended)

```typescript
// Simplest, most maintainable
export function createDJController(socket: SocketWithContext, io: Server) {
  const handlers = createDJHandlers(socket.context)
  const conn = { socket, io }

  socket.on("queue song", (trackId) => handlers.queueSong(conn, trackId))
  socket.on("search track", (query) => handlers.searchForTrack(conn, query))
  // ...
}
```

**Why:**

- ✅ Eliminates repetition
- ✅ Removes unnecessary handler layer
- ✅ Maintains functional style consistent with your codebase
- ✅ Easy to test (test the adapters directly)
- ✅ Minimal refactoring needed

**Option 2: Class-Based** (If you want more structure)

Use classes if you:

- Want explicit private methods for testing
- Prefer OOP style
- Need more complex controller lifecycle management

## Migration Path

1. **Phase 1:** Convert one controller (e.g., DJController) to new pattern
2. **Phase 2:** Update tests for that controller
3. **Phase 3:** If satisfied, convert remaining controllers
4. **Phase 4:** Remove now-unused handler wrapper layer

## Example Pull Request

### Before (Current)

```typescript
// djController.ts
export default function djController(socket: Socket, io: Server) {
  socket.on("queue song", (trackId) => queueSong({ socket, io }, trackId))
}

// djHandlers.ts (thin wrapper - 45 lines)
export async function queueSong({ socket, io }: HandlerConnections, trackId: string) {
  const { context } = socket
  const djHandlers = createDJHandlers(context)
  return djHandlers.queueSong({ socket, io }, trackId)
}
```

### After (Proposed)

```typescript
// djController.ts (simplified, no separate handler file needed)
export function createDJController(socket: SocketWithContext, io: Server) {
  const handlers = createDJHandlers(socket.context)
  const conn = { socket, io }

  socket.on("queue song", (trackId) => handlers.queueSong(conn, trackId))
  // ...
}

// djHandlers.ts deleted - no longer needed!
```

**Result:**

- 45 lines removed
- No more repetition
- Clearer code flow
- Same functionality

## Conclusion

The current pattern is **functional but verbose**. I recommend:

1. **Short term:** Use HOF with closure pattern (minimal changes)
2. **Consider:** Removing the handler wrapper layer entirely
3. **Long term:** Evaluate class-based if you need more structure

All three options are significant improvements over the current approach in terms of:

- Code maintainability
- Testability
- Developer experience
