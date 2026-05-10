import { queueItemFactory } from "@repo/factories/queueItem"
import type {
  ChatMessage,
  PluginAPI,
  QueueItem,
  QueueItemAttribution,
  Reaction,
  ScreenEffectName,
  ScreenEffectTarget,
  User,
} from "@repo/types"
import type { ReactionSubject } from "@repo/types"
import type { MockPluginLifecycle } from "./mockLifecycle"
import type { StudioRoom } from "./studioRoom"
import { studioSystemMessage } from "./chatHelpers"
import { checkQueueDefenseStudio } from "./studioDefense"
export class MockStudioPluginApi implements PluginAPI {
  constructor(
    private readonly room: StudioRoom,
    private readonly lifecycle: MockPluginLifecycle,
    private readonly pluginName: string,
  ) {}

  async getNowPlaying(): Promise<QueueItem | null> {
    return this.room.queue[0] ?? null
  }

  async getReactions(_params: {
    roomId: string
    reactTo: ReactionSubject
    filterEmoji?: string
  }): Promise<Reaction[]> {
    return this.room.getReactions(_params.roomId, _params.reactTo)
  }

  async getUsers(_roomId: string): Promise<User[]> {
    return [...this.room.users.values()]
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    return userIds.map((id) => {
      const u = this.room.users.get(id)
      if (u) return u
      return { userId: id, username: id }
    })
  }

  async skipTrack(_roomId: string, trackId: string): Promise<void> {
    const np = this.room.queue[0]
    if (np?.mediaSource.trackId === trackId) {
      this.room.queue.shift()
      const next = this.room.queue[0]
      if (next) {
        await this.lifecycle.emit("TRACK_CHANGED", {
          roomId: this.room.roomId,
          track: next,
        })
      }
      this.room.logEvent("SKIP_TRACK", { trackId })
      this.room.notify()
    }
  }

  async sendSystemMessage(
    roomId: string,
    message: string,
    meta?: ChatMessage["meta"],
    mentions?: ChatMessage["mentions"],
  ): Promise<void> {
    this.room.appendChat(studioSystemMessage(message, meta, mentions))
    await this.lifecycle.emit("MESSAGE_RECEIVED", {
      roomId,
      message: studioSystemMessage(message, meta, mentions),
    })
  }

  async sendUserSystemMessage(
    roomId: string,
    userId: string,
    message: string,
    meta?: ChatMessage["meta"],
  ): Promise<void> {
    const u = this.room.users.get(userId)
    const mentionName = u?.username ?? userId
    const m = studioSystemMessage(message, meta, mentionName ? [mentionName] : undefined)
    this.room.appendChat(m)
    this.room.logEvent("USER_SYSTEM_MESSAGE", { userId, message })
  }

  async getPluginConfig(roomId: string, pluginName: string): Promise<unknown | null> {
    if (roomId !== this.room.roomId) return null
    return this.room.getPluginConfig(pluginName)
  }

  async setPluginConfig(roomId: string, pluginName: string, config: unknown): Promise<void> {
    if (roomId !== this.room.roomId) return
    this.room.setPluginConfig(pluginName, config as Record<string, unknown>)
  }

  async updatePlaylistTrack(): Promise<void> {}

  async getQueue(roomId: string): Promise<QueueItem[]> {
    if (roomId !== this.room.roomId) return []
    return [...this.room.queue]
  }

  async addToTrackQueue(
    roomId: string,
    metadataTrackId: string,
    options?: { addedBy?: QueueItemAttribution; runPluginValidation?: boolean },
  ): Promise<{ success: true; queuedItem: QueueItem } | { success: false; message: string }> {
    if (roomId !== this.room.roomId) return { success: false, message: "Wrong room" }
    const base = queueItemFactory.build()
    let addedBy: User | undefined
    if (options?.addedBy?.type === "user") {
      addedBy = {
        userId: options.addedBy.userId,
        username: options.addedBy.username,
      }
    } else if (options?.addedBy?.type === "plugin") {
      addedBy = {
        userId: `plugin:${options.addedBy.pluginName}`,
        username: options.addedBy.displayName ?? options.addedBy.pluginName,
      }
    }
    const queuedItem: QueueItem = {
      ...base,
      title: `Track ${metadataTrackId}`,
      mediaSource: { type: "spotify", trackId: metadataTrackId },
      metadataSource: { type: "spotify", trackId: metadataTrackId },
      track: {
        ...base.track,
        id: metadataTrackId,
        title: `Track ${metadataTrackId}`,
      },
      addedAt: Date.now(),
      addedBy,
    }
    this.room.queue.push(queuedItem)
    await this.lifecycle.emit("PLAYLIST_TRACK_ADDED", { roomId: this.room.roomId, track: queuedItem })
    this.room.logEvent("QUEUE_ADD", { metadataTrackId })
    this.room.notify()
    return { success: true, queuedItem }
  }

  async removeFromTrackQueue(): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async moveToTrackQueueTop(): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async moveToTrackQueueBottom(): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async moveTrackByPosition(
    roomId: string,
    metadataTrackId: string,
    delta: number,
    actorUserId?: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    if (roomId !== this.room.roomId) return { success: false, message: "Wrong room" }
    const queue = this.room.queue
    const index = queue.findIndex((q) => q.track.id === metadataTrackId)
    if (index === -1) return { success: false, message: "Track not found in queue" }

    const queueItem = queue[index]
    if (queueItem) {
      const ownerId = queueItem.addedBy?.userId ?? ""
      const intent = delta > 0 ? ("negative" as const) : ("positive" as const)
      const blocked = checkQueueDefenseStudio(this.room, ownerId, intent)
      if (blocked) {
        const session = this.room.activeSession
        await this.lifecycle.emit("GAME_EFFECT_BLOCKED", {
          roomId: this.room.roomId,
          sessionId: session?.id ?? "",
          targetUserId: ownerId,
          actorUserId,
          blockType: "queue",
          queue: { metadataTrackId, delta, intent },
          blockedBy: {
            itemDefinitionId: blocked.itemDefinitionId,
            itemId: blocked.itemId,
            defenderUserId: blocked.defenderUserId,
            itemName: blocked.itemName,
          },
        })
        const attackerName = actorUserId
          ? (this.room.users.get(actorUserId)?.username?.trim() ?? "Someone")
          : "Someone"
        const targetName = ownerId ? (this.room.users.get(ownerId)?.username?.trim() ?? ownerId) : ownerId
        const actionWord = intent === "negative" ? "demote" : "promote"
        this.room.appendChat(
          studioSystemMessage(
            `${attackerName} tried to ${actionWord} ${targetName}'s queued track, but ${blocked.itemName} blocked it.`,
            { type: "alert", status: "warning", title: "Blocked" },
          ),
        )
        return { success: false, message: `Blocked by ${blocked.itemName}` }
      }
    }

    if (queue.length <= 1) {
      return { success: false, message: "Not enough tracks in the queue to reorder" }
    }
    const finalIndex = Math.max(0, Math.min(queue.length - 1, index + delta))
    if (finalIndex === index) {
      return { success: false, message: "Track can't move further in that direction" }
    }
    const reordered = [...queue]
    const [target] = reordered.splice(index, 1)
    if (!target) return { success: false, message: "Track not found in queue" }
    reordered.splice(finalIndex, 0, target)
    this.room.queue = reordered
    await this.lifecycle.emit("QUEUE_CHANGED", { roomId: this.room.roomId, queue: reordered })
    this.room.logEvent("QUEUE_MOVE", { metadataTrackId, delta })
    this.room.notify()
    return { success: true }
  }

  async shuffleTrackQueue(): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async emit<T extends Record<string, unknown>>(eventName: string, data: T): Promise<void> {
    const type = `PLUGIN:${this.pluginName}:${eventName}`
    this.room.logEvent(type, data)
    this.room.notify()
  }

  async queueSoundEffect(params: { url: string; volume?: number }): Promise<void> {
    this.room.logEvent("SOUND_EFFECT", params)
  }

  async queueScreenEffect(_params: {
    target: ScreenEffectTarget
    targetId?: string
    effect: ScreenEffectName
    duration?: number
  }): Promise<void> {
    this.room.logEvent("SCREEN_EFFECT", _params)
  }
}
