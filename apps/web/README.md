# Listening Room Web Client

A React-based web client for Listening Room, using XState v5 for state management and Socket.IO for real-time communication.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Directory Structure](#directory-structure)
- [State Management](#state-management)
  - [Actors](#actors)
  - [Machines](#machines)
  - [Socket Integration](#socket-integration)
- [Room Lifecycle](#room-lifecycle)
- [React Integration](#react-integration)
- [Key Patterns](#key-patterns)

---

## Architecture Overview

The application follows a **singleton actor** pattern where:

1. **XState actors** manage all application state as single instances
2. **Socket.IO** provides real-time communication with the server
3. **`socketActor`** acts as the central event hub, broadcasting server events to subscribed actors
4. **React components** consume state via hooks using `@xstate/react`'s `useSelector`

```
┌─────────────────────────────────────────────────────────────────┐
│                         Server                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                        Socket.IO
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      socketActor                                │
│              (Central Event Hub & Connection Manager)           │
└─────────────────────────────────────────────────────────────────┘
           │              │              │              │
     SUBSCRIBE      SUBSCRIBE      SUBSCRIBE      SUBSCRIBE
           │              │              │              │
           ▼              ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
    │chatActor │   │usersActor│   │audioActor│   │  ...etc  │
    └──────────┘   └──────────┘   └──────────┘   └──────────┘
           │              │              │              │
           └──────────────┴──────────────┴──────────────┘
                              │
                        useSelector
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     React Components                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
src/
├── actors/           # Singleton XState actor instances
│   ├── index.ts      # Central exports for all actors
│   ├── socketActor.ts    # Socket.IO connection & event hub
│   ├── roomLifecycle.ts  # Room initialization/teardown coordination
│   ├── authActor.ts      # Authentication state
│   ├── chatActor.ts      # Chat messages
│   ├── playlistActor.ts  # Room playlist
│   ├── usersActor.ts     # Online users
│   ├── audioActor.ts     # Audio playback state
│   └── ...               # Other domain actors
│
├── machines/         # XState machine definitions (logic only)
│   ├── chatMachine.ts
│   ├── playlistMachine.ts
│   ├── audioMachine.ts
│   └── ...
│
├── hooks/            # React hooks
│   ├── useActors.ts      # Hooks for consuming actor state
│   └── useSocketMachine.ts   # Hook for component-local socket-connected machines
│
├── components/       # React components
├── lib/              # Utilities and services
│   ├── socket.ts         # Socket.IO client instance
│   └── ...
│
├── routes/           # TanStack Router routes
├── types/            # TypeScript type definitions
└── themes/           # Theme configurations
```

---

## State Management

### Actors

Actors are **singleton XState interpreters** that manage specific domains of state. They are created once at app startup and persist for the app's lifetime.

#### Actor Categories

| Actor | Purpose |
|-------|---------|
| `socketActor` | Socket.IO connection management and event broadcasting |
| `authActor` | User authentication and session state |
| `chatActor` | Chat messages and typing state |
| `playlistActor` | Room playlist/queue |
| `usersActor` | Online users in the room |
| `reactionsActor` | Emoji reactions on messages/tracks |
| `settingsActor` | Room settings and configuration |
| `roomActor` | Room metadata and error state |
| `audioActor` | Audio playback state (play/pause/volume) |
| `djActor` | DJ session state |
| `adminActor` | Admin actions (settings, kick, etc.) |
| `modalsActor` | Modal dialog state |
| `themeActor` | UI theme selection |
| `errorsActor` | Error notifications |
| `bookmarkedChatActor` | User's bookmarked messages |
| `metadataSourceAuthActor` | Spotify/service authentication |

#### Actor Pattern

Each actor follows this structure:

```typescript
// actors/chatActor.ts
import { createActor } from "xstate"
import { chatMachine } from "../machines/chatMachine"

// Create singleton instance
export const chatActor = createActor(chatMachine).start()

// Export convenience functions
export const getChatMessages = () => chatActor.getSnapshot().context.messages
export const submitMessage = (content: string) => 
  chatActor.send({ type: "SUBMIT_MESSAGE", data: content })
```

### Machines

Machines define the **logic and state transitions** without being instantiated. They are pure definitions that actors interpret.

#### Machine Structure (XState v5)

```typescript
// machines/chatMachine.ts
import { setup, assign } from "xstate"
import { subscribeById, unsubscribeById, emitToSocket } from "../actors/socketActor"

export const chatMachine = setup({
  types: {
    context: {} as ChatContext,
    events: {} as ChatEvent,
  },
  actions: {
    // Subscribe to socket events on activation
    subscribe: assign(({ self }) => {
      const id = `chat-${self.id}`
      subscribeById(id, { send: (event) => self.send(event as ChatEvent) })
      return { subscriptionId: id }
    }),
    // Unsubscribe on deactivation
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) unsubscribeById(context.subscriptionId)
    },
    // Send messages to server
    sendMessage: ({ event }) => {
      if (event.type === "SUBMIT_MESSAGE") {
        emitToSocket("SEND_MESSAGE", event.data)
      }
    },
  },
}).createMachine({
  id: "chat",
  initial: "idle",
  context: { messages: [], subscriptionId: null },
  states: {
    idle: {
      on: { ACTIVATE: "active" }
    },
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe"],
      on: {
        DEACTIVATE: { target: "idle", actions: ["resetMessages"] },
        INIT: { actions: ["setData"] },
        MESSAGE_RECEIVED: { actions: ["addMessage"] },
        SUBMIT_MESSAGE: { actions: ["sendMessage"] },
      },
    },
  },
})
```

### Socket Integration

The `socketActor` is the **central hub** for all socket communication:

#### How It Works

1. **Connection Management**: `socketActor` maintains the Socket.IO connection lifecycle
2. **Event Broadcasting**: Server events are received and broadcast to all subscribed actors
3. **Subscription Pattern**: Actors subscribe using `subscribeById()` with unique IDs

```typescript
// socketActor broadcasts SERVER_EVENT to all subscribers
// Each actor receives events like { type: "MESSAGE_RECEIVED", data: {...} }

// Subscribing (done in machine's entry action)
subscribeById("chat-actor", { 
  send: (event) => chatActor.send(event) 
})

// Emitting to server
emitToSocket("SEND_MESSAGE", { content: "Hello!" })
```

#### Event Flow

```
Server → Socket.IO → socketActor → broadcast → chatActor
                                            → usersActor
                                            → playlistActor
                                            → ...

chatActor → emitToSocket("SEND_MESSAGE") → socketActor → Socket.IO → Server
```

---

## Room Lifecycle

Room state is coordinated by `roomLifecycle.ts`:

### Entering a Room

```typescript
// Called when navigating to /rooms/:roomId
initializeRoom(roomId)

// This:
// 1. Activates all room actors (they subscribe to socket events)
// 2. Fetches room data from server
// 3. Triggers authentication flow
// 4. Starts auto-saving state for tab recovery
```

### Leaving a Room

```typescript
// Called when navigating away from room
teardownRoom()

// This:
// 1. Deactivates all room actors (they unsubscribe and reset state)
// 2. Stops auto-save
// 3. Notifies server of disconnect
```

### ACTIVATE/DEACTIVATE Pattern

All room-scoped actors support this pattern:

```typescript
// Machine definition
states: {
  idle: {
    on: { ACTIVATE: "active" }
  },
  active: {
    entry: ["subscribe"],      // Subscribe to socket events
    exit: ["unsubscribe"],     // Clean up subscription
    on: {
      DEACTIVATE: { 
        target: "idle", 
        actions: ["resetState"] 
      },
      // Handle socket events...
      INIT: { actions: ["setData"] },
    },
  },
}
```

---

## React Integration

### Consuming State with Hooks

The `useActors.ts` file provides hooks for all actors:

```tsx
import { 
  useCurrentUser, 
  useChatMessages, 
  useIsAuthenticated,
  useChatSend 
} from "../hooks/useActors"

function ChatWindow() {
  const user = useCurrentUser()
  const messages = useChatMessages()
  const isAuth = useIsAuthenticated()
  const sendChat = useChatSend()

  const handleSend = (content: string) => {
    sendChat({ type: "SUBMIT_MESSAGE", data: content })
  }

  return (/* ... */)
}
```

### Hook Categories

```typescript
// State selectors
useCurrentUser()      // Get current user object
useChatMessages()     // Get chat messages array
useIsAuthenticated()  // Check if authenticated
useIsAdmin()          // Check if current user is admin
usePlaylistActive()   // Check if playlist drawer is open

// Send functions (for dispatching events)
useChatSend()         // Returns chatActor.send
useAuthSend()         // Returns authActor.send
usePlaylistSend()     // Returns playlistActor.send
```

### Component-Local Machines

For machines that need socket events but are component-scoped:

```tsx
import { useSocketMachine } from "../hooks/useSocketMachine"
import { savePlaylistMachine } from "../machines/savePlaylistMachine"

function SavePlaylistButton() {
  const [state, send] = useSocketMachine(savePlaylistMachine)
  
  return (
    <button 
      onClick={() => send({ type: "SAVE", trackIds: [...] })}
      disabled={state.matches("loading")}
    >
      {state.matches("loading") ? "Saving..." : "Save"}
    </button>
  )
}
```

---

## Key Patterns

### 1. Singleton Actors with ACTIVATE/DEACTIVATE

Actors are singletons but manage room-scoped state via activation:

```typescript
// Room-scoped actors start in "idle" state
// When entering a room, roomLifecycle sends ACTIVATE
// When leaving, it sends DEACTIVATE to reset state
```

### 2. ID-Based Socket Subscriptions

Subscriptions use stable IDs for resilience:

```typescript
// In machine entry action
const id = `chat-${self.id}-${counter++}`
subscribeById(id, { send: (e) => self.send(e) })

// Using unique IDs prevents duplicate subscriptions
// and handles React StrictMode's double-mounting
```

### 3. Synchronous Subscription via Entry Actions

Socket subscriptions happen in `entry` actions (synchronous) rather than `invoke` (asynchronous):

```typescript
active: {
  entry: ["subscribe"],  // ✅ Synchronous - registered immediately
  exit: ["unsubscribe"],
}

// NOT invoke (which is async and can cause race conditions)
```

### 4. Server Events → Machine Events

Server events map directly to machine events:

```typescript
// Server sends: { type: "MESSAGE_RECEIVED", data: {...} }
// socketActor broadcasts to subscribers
// chatMachine handles: MESSAGE_RECEIVED: { actions: ["addMessage"] }
```

### 5. XState v5 Patterns

```typescript
// Setup pattern for type safety
setup({
  types: { context: {} as Context, events: {} as Event },
  actions: { /* ... */ },
  guards: { /* ... */ },
}).createMachine({ /* ... */ })

// Event objects (not strings)
send({ type: "SUBMIT", data: value })  // ✅
send("SUBMIT")  // ❌ XState v4 pattern

// Guard instead of cond
{ target: "next", guard: "isValid" }  // ✅
{ target: "next", cond: "isValid" }   // ❌ XState v4

// Machine.provide() for overriding actions
const customMachine = baseMachine.provide({
  actions: { notify: () => toast("Custom!") }
})
```

---

## Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Type check
pnpm tsc --noEmit
```

## Tech Stack

- **React 18** - UI framework
- **XState v5** - State management
- **Socket.IO Client** - Real-time communication
- **Chakra UI v3** - Component library
- **TanStack Router** - Client-side routing
- **Vite** - Build tool
- **TypeScript** - Type safety

