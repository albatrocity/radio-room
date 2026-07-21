# Plugin API Reference


### PluginAPI Methods

| Method                                         | Description                      |
| ---------------------------------------------- | -------------------------------- |
| `getNowPlaying(roomId)`                        | Get current track                |
| `getUsers(roomId)`                             | Get users in room                |
| `getReactions(params)`                         | Get reactions for track/message  |
| `skipTrack(roomId, trackId)`                   | Skip current track               |
| `sendSystemMessage(roomId, message, options?)` | Send system chat message         |
| `getPluginConfig(roomId, pluginName)`          | Get plugin config                |
| `setPluginConfig(roomId, pluginName, config)`  | Update plugin config             |
| `updatePlaylistTrack(roomId, track)`           | Update track with pluginData     |
| `emit(eventName, data)`                        | Emit plugin event to frontend    |
| `queueSoundEffect(params)`                     | Play a sound effect in the room  |
| `queueScreenEffect(params)`                    | Play a CSS animation in the room |

### Game & inventory APIs (`PluginContext`)

Available as **`context.game`** and **`context.inventory`** (and **`this.game`** / **`this.inventory`** on `BasePlugin`). Full reference: [Game Sessions & Inventory](game-sessions.md#game-sessions--inventory); types: `GameSessionPluginAPI`, `InventoryPluginAPI` in `@repo/types`.

### Queue Validation Helpers

Helper functions exported from `@repo/types` for use in `validateQueueRequest`:

| Function                             | Returns                      | Description                        |
| ------------------------------------ | ---------------------------- | ---------------------------------- |
| `allowQueueRequest()`                | `{ allowed: true }`          | Allow the queue request to proceed |
| `rejectQueueRequest(reason: string)` | `{ allowed: false, reason }` | Block with user-facing message     |

### System Message Options

```typescript
await this.context.api.sendSystemMessage(roomId, "Message text", {
  type: "alert", // "info" | "alert"
  status: "info", // "info" | "success" | "warning" | "error"
})
```

### Sound Effects

Play audio sound effects in the room. Sound effects are queued and played one at a time.

```typescript
await this.context.api.queueSoundEffect({
  url: "https://example.com/sounds/notification.mp3",
  volume: 0.5, // 0.0 to 1.0, defaults to 1.0
})

// Play only for one user (ADR 0072)
await this.context.api.queueSoundEffect({
  url: "https://example.com/sounds/ding.mp3",
  volume: 0.3,
  userId: "user-123",
})
```

**Parameters:**

| Parameter | Type     | Required | Description                                                                 |
| --------- | -------- | -------- | --------------------------------------------------------------------------- |
| `url`     | `string` | Yes      | URL to the audio file (mp3, wav, ogg, etc)                                  |
| `volume`  | `number` | No       | Volume level from 0.0 to 1.0 (default: 1.0)                                 |
| `userId`  | `string` | No       | When set, play only on that user's client; omit for room-wide (ADR 0072)   |

**Example: Play sound on special event**

```typescript
private async onReactionAdded(data: { roomId: string; reaction: any }): Promise<void> {
  const config = await this.getConfig()
  if (!config?.enabled || !config.soundEffectUrl) return

  // Play sound when someone reacts with the target emoji
  if (data.reaction.emoji.shortcodes === config.targetEmoji) {
    await this.context!.api.queueSoundEffect({
      url: config.soundEffectUrl,
      volume: config.soundEffectVolume ?? 0.5,
    })
  }
}
```

**Notes:**

- Omit `userId` to play on all clients; set `userId` for per-client delivery
- Multiple sound effects are queued and played sequentially (one at a time)
- Audio files must be accessible via HTTPS and support CORS
- Sound effect volume is capped at the user's current volume setting (sound effects will never be louder than the radio)
- If a user has muted audio, sound effects are skipped
- Sound effects use Web Audio API, separate from the radio stream

### Screen Effects

Play CSS animations (from animate.css) on UI elements in the room. Screen effects are queued and played one at a time.

```typescript
await this.context.api.queueScreenEffect({
  target: "nowPlaying",
  effect: "pulse",
  duration: 1000, // optional, in milliseconds
})
```

**Parameters:**

| Parameter          | Type                 | Required | Description                                                                                          |
| ------------------ | -------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `target`           | `ScreenEffectTarget` | Yes      | What to animate: `room`, `nowPlaying`, `message`, `plugin`, or `user`                               |
| `targetId`         | `string`             | No       | For `message`: timestamp or `"latest"`. For `plugin`: component ID. For `user`: userId              |
| `effect`           | `ScreenEffectName`   | Yes      | Animation name (see available effects below)                                                         |
| `duration`         | `number`             | No       | Custom duration in milliseconds (default varies by effect)                                           |
| `recipientUserId`  | `string`             | No       | When set, deliver only to that user's client; omit for room-wide (ADR 0073)                         |

**`recipientUserId` vs `target: "user"`:** `recipientUserId` controls **which client receives** the event. `target: "user"` selects **which DOM node** to animate (the user list row). They are independent — you can animate a plugin card for one recipient, or animate a user row for everyone.

**Target Types:**

| Target       | Description             | `targetId` Usage                |
| ------------ | ----------------------- | ------------------------------- |
| `room`       | Entire room UI          | Not needed                      |
| `nowPlaying` | Now playing section     | Not needed                      |
| `message`    | Specific chat message   | Message timestamp or `"latest"` |
| `plugin`     | Plugin's own components | Component `id` from your schema |
| `user`       | Specific user in list   | User's `userId`                 |

**Available Effects (animate.css attention seekers):**

`bounce`, `flash`, `pulse`, `rubberBand`, `shakeX`, `shakeY`, `headShake`, `swing`, `tada`, `wobble`, `jello`, `heartBeat`

**Example: Animate plugin component on event**

```typescript
private async onWordDetected(word: string, message: ChatMessage): Promise<void> {
  const config = await this.getConfig()
  if (!config?.enabled) return

  // Pulse the leaderboard button when a special word is detected
  await this.context!.api.queueScreenEffect({
    target: "plugin",
    targetId: "leaderboard-button", // matches component id in schema
    effect: "pulse",
  })
}
```

**Example: Animate a plugin component for one user only**

```typescript
await this.context!.api.queueScreenEffect({
  target: "plugin",
  targetId: "quiz-question-card",
  effect: "tada",
  duration: 500,
  recipientUserId: userId,
})
```

**Example: Animate a chat message**

```typescript
// Shake the message that triggered an event
await this.context!.api.queueScreenEffect({
  target: "message",
  targetId: message.timestamp,
  effect: "shakeX",
})

// Or animate the most recent message
await this.context!.api.queueScreenEffect({
  target: "message",
  targetId: "latest",
  effect: "flash",
})
```

**Example: Animate the now playing section**

```typescript
// Celebrate when a popular track starts
await this.context!.api.queueScreenEffect({
  target: "nowPlaying",
  effect: "tada",
  duration: 1500,
})
```

**Example: Animate a specific user**

```typescript
// Pulse a user when they earn a point
await this.context!.api.queueScreenEffect({
  target: "user",
  targetId: userId, // The user's userId
  effect: "pulse",
})
```

**Notes:**

- Omit `recipientUserId` to play on all clients; set it for per-client delivery
- Multiple screen effects are queued and played sequentially (one at a time)
- Users can disable animations via the "Reduce Motion" preference in settings
- The system also respects the OS-level `prefers-reduced-motion` setting
- Plugins can only animate their own components (using component `id` from schema)
- For chat messages, use animations that don't scale (`flash`, `shakeX`, `shakeY`, `headShake`) to avoid clipping issues in scroll containers
