# Canonical Event Payload Structures

## Design Principles

1. **Consistency**: All room-scoped events include `roomId` at the root level
2. **Clarity**: Main data is at a predictable, flat location (no unnecessary nesting)
3. **Completeness**: Include both the change and the resulting state where applicable
4. **Type Safety**: All payloads use strongly-typed interfaces

## Standard Payload Structure

```typescript
{
  roomId: string          // Always present for room-scoped events
  [primaryData]: T        // The main data for this event (e.g., user, track, message)
  [contextData]?: T       // Optional contextual data (e.g., full list after change)
}
```

## Event Payload Specifications

### Reaction Events

**Current Structure (✅ Already Standardized)**:
```typescript
reactionAdded: {
  roomId: string
  reaction: ReactionPayload    // The reaction that was added
  reactions?: ReactionStore    // Complete reactions state (for Socket.IO)
}

reactionRemoved: {
  roomId: string
  reaction: ReactionPayload    // The reaction that was removed
  reactions?: ReactionStore    // Complete reactions state (for Socket.IO)
}
```

**Notes**:
- `reactions` is optional for plugins but required for Socket.IO
- `ReactionStore = { message: Record<string, Reaction[]>, track: Record<string, Reaction[]> }`

---

### Track Events

**Current Structure (✅ Already Standardized)**:
```typescript
trackChanged: {
  roomId: string
  track: QueueItem          // The new track
  roomMeta?: RoomMeta       // Room metadata (for PubSub context)
}

playlistTrackAdded: {
  roomId: string
  track: QueueItem          // The track that was added
}
```

**Notes**:
- `roomMeta` is optional and primarily for PubSub subscribers

---

### User Events

**Current Structure (⚠️ Needs Standardization)**:
```typescript
// Current
userJoined: {
  roomId: string
  user: User              // The user who joined
  users?: User[]          // Complete user list (for Socket.IO)
}

userLeft: {
  roomId: string
  user: User              // The user who left
}

userStatusChanged: {
  roomId: string
  user: User              // The user with updated status
  oldStatus?: string      // Previous status for comparison
}

userKicked: {
  roomId: string
  userId: string          // ⚠️ Inconsistent - should be 'user' object
  message?: any           // ⚠️ Type should be more specific
}
```

**Proposed Standardization**:
```typescript
userKicked: {
  roomId: string
  user: User              // Consistent with other user events
  reason?: string         // Clearer than 'message'
}
```

---

### Message Events

**Current Structure (⚠️ Needs Standardization)**:
```typescript
// Current
messageReceived: {
  roomId: string
  message: any            // ⚠️ Should be typed as ChatMessage
}

messagesCleared: {
  roomId: string
}

typingChanged: {
  roomId: string
  typing: string[]        // ⚠️ Should be User[] for consistency
}
```

**Proposed Standardization**:
```typescript
messageReceived: {
  roomId: string
  message: ChatMessage    // Use proper type
}

messagesCleared: {
  roomId: string
}

typingChanged: {
  roomId: string
  typing: User[]          // Use User objects instead of string IDs
}
```

---

### Room Events

**Current Structure (✅ Mostly Standardized)**:
```typescript
roomDeleted: {
  roomId: string
}

roomSettingsUpdated: {
  roomId: string
  room: Room              // Complete room object with new settings
}

configChanged: {
  roomId: string
  config: any             // ⚠️ Should be more specifically typed
  previousConfig: any     // ⚠️ Should be more specifically typed
}
```

**Proposed Standardization**:
```typescript
configChanged: {
  roomId: string
  config: Record<string, unknown>     // More specific than 'any'
  previousConfig: Record<string, unknown>
}
```

---

### Error Events

**Current Structure (⚠️ Needs Standardization)**:
```typescript
// Current
errorOccurred: {
  roomId: string
  error: any              // ⚠️ Should be typed
  status?: number
  message?: string
}
```

**Proposed Standardization**:
```typescript
errorOccurred: {
  roomId: string
  error: Error | string   // Allow Error object or string
  status?: number         // HTTP status code
  message?: string        // Human-readable message
}
```

---

## Summary of Changes Needed

### High Priority

1. **`typingChanged`**: Change `typing: string[]` to `typing: User[]`
2. **`messageReceived`**: Change `message: any` to `message: ChatMessage`
3. **`userKicked`**: Change `userId: string` to `user: User`, `message?: any` to `reason?: string`

### Medium Priority

4. **`configChanged`**: Change `any` to `Record<string, unknown>`
5. **`errorOccurred`**: Change `error: any` to `error: Error | string`

### Implementation Order

1. Update type definitions in `packages/types/Plugin.ts`
2. Update emitters in operations layer
3. Update consumers in frontend machines
4. Run tests to verify compatibility

## Migration Impact

- **Plugins**: May need updates if they access `typingChanged` or `userKicked` payloads
- **Frontend**: Machines that consume `typingChanged` need to adapt from string[] to User[]
- **Operations**: Event emitters need to pass proper types

