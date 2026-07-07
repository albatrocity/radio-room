# Event System


Plugins subscribe to system events using SCREAMING_SNAKE_CASE names.

### Available Events

| Event                   | Payload                                          | Description                        |
| ----------------------- | ------------------------------------------------ | ---------------------------------- |
| `TRACK_CHANGED`         | `{ roomId, track: QueueItem }`                   | Now playing changed                |
| `REACTION_ADDED`        | `{ roomId, reaction: ReactionPayload }`          | User added reaction                |
| `REACTION_REMOVED`      | `{ roomId, reaction: ReactionPayload }`          | User removed reaction              |
| `MESSAGE_RECEIVED`      | `{ roomId, message: ChatMessage }`               | Chat message sent                  |
| `USER_JOINED`           | `{ roomId, user: User }`                         | User joined room                   |
| `USER_LEFT`             | `{ roomId, user: User }`                         | User left room                     |
| `CONFIG_CHANGED`        | `{ roomId, pluginName, config, previousConfig }` | Plugin config updated              |
| `ROOM_SETTINGS_UPDATED` | `{ roomId, room: Room }`                         | Room settings changed              |
| `ROOM_DELETED`          | `{ roomId }`                                     | Room was deleted                   |
| `SEGMENT_ACTIVATED`     | `{ roomId, showId, segmentId, segmentTitle }`    | Admin activated a schedule segment |

### Game & inventory events

These fire when [game sessions & inventory](game-sessions.md#game-sessions--inventory) are in use:

| Event                        | Payload (summary)                                             |
| ---------------------------- | ------------------------------------------------------------- |
| `GAME_SESSION_STARTED`       | `{ roomId, sessionId, config }`                               |
| `GAME_SESSION_ENDED`         | `{ roomId, sessionId, results }`                              |
| `GAME_STATE_CHANGED`         | `{ roomId, sessionId, userId, changes }`                      |
| `GAME_MODIFIER_APPLIED`      | `{ roomId, sessionId, userId, modifier }`                     |
| `GAME_MODIFIER_REMOVED`      | `{ roomId, sessionId, userId, modifierId, reason }`           |
| `INVENTORY_ITEM_ACQUIRED`    | `{ roomId, sessionId, userId, item, source }`                 |
| `INVENTORY_ITEM_USED`        | `{ roomId, sessionId, userId, item, result }`                 |
| `INVENTORY_ITEM_REMOVED`     | `{ roomId, sessionId, userId, itemId, quantity }`             |
| `INVENTORY_ITEM_TRANSFERRED` | `{ roomId, sessionId, fromUserId, toUserId, item, quantity }` |

### Example Event Handlers

```typescript
async register(context: PluginContext): Promise<void> {
  await super.register(context)

  this.on("TRACK_CHANGED", async (data) => {
    const config = await this.getConfig()
    if (!config?.enabled) return

    await this.context!.api.sendSystemMessage(
      data.roomId,
      `🎵 Now playing: ${data.track.title}`
    )
  })

  this.on("REACTION_ADDED", async (data) => {
    if (data.reaction.reactTo.type === "track") {
      const emoji = data.reaction.emoji.shortcodes
      console.log(`User reacted with ${emoji}`)
    }
  })

  this.on("USER_LEFT", async (data) => {
    // Check if any admins remain
    const users = await this.context!.api.getUsers(data.roomId)
    if (!users.some(u => u.isAdmin)) {
      // Disable plugin if no admins
    }
  })
}
```
