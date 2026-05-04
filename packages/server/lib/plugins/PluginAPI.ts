import {
  AppContext,
  PluginAPI,
  QueueItem,
  QueueItemAttribution,
  Reaction,
  User,
  ReactionSubject,
  ChatMessage,
  ScreenEffectTarget,
  ScreenEffectName,
} from "@repo/types"
import { Server } from "socket.io"
import { getRoomPath } from "../getRoomPath"

/**
 * Implementation of the Plugin API
 * Provides safe, high-level methods for plugins to interact with the system
 */
export class PluginAPIImpl implements PluginAPI {
  private pluginName: string | null = null
  private roomId: string | null = null

  constructor(
    private readonly context: AppContext,
    private readonly io: Server,
  ) {}

  /**
   * Set the plugin context for namespacing events.
   * Called by PluginRegistry when creating the context for a plugin.
   */
  setPluginContext(pluginName: string, roomId: string): void {
    this.pluginName = pluginName
    this.roomId = roomId
  }

  /**
   * Create a scoped API instance for a specific plugin and room.
   * This ensures emit() has the correct namespace.
   */
  forPlugin(pluginName: string, roomId: string): PluginAPI {
    const scoped = new PluginAPIImpl(this.context, this.io)
    scoped.setPluginContext(pluginName, roomId)
    return scoped
  }

  async getNowPlaying(roomId: string): Promise<QueueItem | null> {
    const { getRoomCurrent } = await import("../../operations/data")
    const current = await getRoomCurrent({ context: this.context, roomId })
    return current?.nowPlaying ?? null
  }

  async getReactions(params: {
    roomId: string
    reactTo: ReactionSubject
    filterEmoji?: string
  }): Promise<Reaction[]> {
    const { getReactionsForSubject } = await import("../../operations/data")
    const reactions = await getReactionsForSubject({
      context: this.context,
      roomId: params.roomId,
      reactTo: params.reactTo,
    })

    if (params.filterEmoji) {
      // Note: reactions are actually ReactionPayload objects with Emoji type
      return reactions.filter((r: any) => r.emoji?.shortcodes === params.filterEmoji)
    }

    return reactions
  }

  async getUsers(
    roomId: string,
    params?: { status?: "listening" | "participating" },
  ): Promise<User[]> {
    const { getRoomUsers } = await import("../../operations/data")
    const users = await getRoomUsers({ context: this.context, roomId })

    // Filter by status if specified
    if (params?.status) {
      return users.filter((user) => user.status === params.status)
    }

    return users
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    const { getUsersByIds } = await import("../../operations/data")
    return getUsersByIds({ context: this.context, userIds })
  }

  async skipTrack(roomId: string, trackId: string): Promise<void> {
    // Verify the track is still playing before skipping
    const nowPlaying = await this.getNowPlaying(roomId)

    if (!nowPlaying || nowPlaying.mediaSource.trackId !== trackId) {
      console.log(`[PluginAPI] Skip aborted: track ${trackId} is not currently playing`)
      return
    }

    const { AdapterService } = await import("../../services/AdapterService")
    const adapterService = new AdapterService(this.context)
    const playbackController = await adapterService.getRoomPlaybackController(roomId)

    if (!playbackController) {
      throw new Error(`No playback controller found for room ${roomId}`)
    }

    await playbackController.api.skipToNextTrack()
  }

  async sendSystemMessage(
    roomId: string,
    message: string,
    meta?: ChatMessage["meta"],
    mentions?: ChatMessage["mentions"],
  ): Promise<void> {
    const { default: sendMessage } = await import("../../lib/sendMessage")
    const { default: systemMessage } = await import("../../lib/systemMessage")

    const msg = systemMessage(message, meta, mentions)

    await sendMessage(this.io, roomId, msg, this.context)
  }

  async sendUserSystemMessage(
    roomId: string,
    userId: string,
    message: string,
    meta?: ChatMessage["meta"],
  ): Promise<void> {
    const { default: systemMessage } = await import("../../lib/systemMessage")
    const { getRoomUsers } = await import("../../operations/data")

    const users = await getRoomUsers({ context: this.context, roomId })
    const user = users.find((u) => u.userId === userId)
    if (!user?.id) {
      console.warn(
        `[PluginAPI] sendUserSystemMessage: no connected socket for userId ${userId} in room ${roomId}`,
      )
      return
    }

    const msg = systemMessage(message, meta)
    this.io.to(user.id).emit("event", {
      type: "MESSAGE_RECEIVED",
      data: {
        roomId,
        message: msg,
      },
    })
  }

  async getPluginConfig(roomId: string, pluginName: string): Promise<any | null> {
    const { getPluginConfig } = await import("../../operations/data/pluginConfigs")
    return await getPluginConfig({ context: this.context, roomId, pluginName })
  }

  async setPluginConfig(roomId: string, pluginName: string, config: any): Promise<void> {
    const { setPluginConfig } = await import("../../operations/data/pluginConfigs")
    await setPluginConfig({ context: this.context, roomId, pluginName, config })
  }

  async updatePlaylistTrack(roomId: string, track: QueueItem): Promise<void> {
    if (!this.context.systemEvents) {
      console.warn("[PluginAPI] systemEvents not available, cannot update playlist track")
      return
    }

    await this.context.systemEvents.emit(roomId, "PLAYLIST_TRACK_UPDATED", {
      roomId,
      track,
    })
  }

  async getQueue(roomId: string): Promise<QueueItem[]> {
    const { getQueue } = await import("../../operations/data")
    return await getQueue({ context: this.context, roomId })
  }

  async addToTrackQueue(
    roomId: string,
    metadataTrackId: string,
    options?: { addedBy?: QueueItemAttribution; runPluginValidation?: boolean },
  ): Promise<
    | { success: true; queuedItem: QueueItem }
    | { success: false; message: string }
  > {
    const attribution: QueueItemAttribution =
      options?.addedBy ?? {
        type: "plugin",
        pluginName: this.pluginName ?? "unknown-plugin",
      }

    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    const result = await djService.queueSongAs(roomId, attribution, metadataTrackId, {
      runPluginValidation: options?.runPluginValidation ?? false,
    })

    if (result.success) {
      return { success: true, queuedItem: result.queuedItem }
    }
    return { success: false, message: result.message }
  }

  async removeFromTrackQueue(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.removeTrackFromQueue(roomId, metadataTrackId)
  }

  async moveToTrackQueueTop(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackToQueueTop(roomId, metadataTrackId)
  }

  async moveToTrackQueueBottom(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackToQueueBottom(roomId, metadataTrackId)
  }

  async moveTrackByPosition(
    roomId: string,
    metadataTrackId: string,
    delta: number,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackByPosition(roomId, metadataTrackId, delta)
  }

  async shuffleTrackQueue(
    roomId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.shuffleQueue(roomId)
  }

  /**
   * Emit a custom plugin event.
   * Events are namespaced as PLUGIN:{pluginName}:{eventName}
   *
   * Note: Plugin events emit directly to Socket.IO rather than through SystemEvents
   * because they are:
   * 1. Dynamically named (not typed in SystemEventTypes)
   * 2. Room-specific only (don't need lobby or cross-server broadcasting)
   * 3. Already properly namespaced to avoid conflicts
   */
  async emit<T extends Record<string, unknown>>(eventName: string, data: T): Promise<void> {
    if (!this.pluginName || !this.roomId) {
      console.warn("[PluginAPI] Cannot emit event: plugin context not set")
      return
    }

    // Create namespaced event name: PLUGIN:{pluginName}:{eventName}
    const namespacedEvent = `PLUGIN:${this.pluginName}:${eventName}`

    // Add roomId to payload
    const payload = {
      roomId: this.roomId,
      ...data,
    }

    console.log(`[PluginAPI] Emitting ${namespacedEvent}`, payload)

    // Broadcast to room via Socket.IO (direct emission is intentional - see above)
    this.io.to(getRoomPath(this.roomId)).emit("event", {
      type: namespacedEvent,
      data: payload,
    })
  }

  /**
   * Queue a sound effect to be played on all clients in the room.
   */
  async queueSoundEffect(params: { url: string; volume?: number }): Promise<void> {
    if (!this.roomId) {
      console.warn("[PluginAPI] Cannot queue sound effect: room context not set")
      return
    }

    if (!this.context.systemEvents) {
      console.warn("[PluginAPI] systemEvents not available, cannot queue sound effect")
      return
    }

    await this.context.systemEvents.emit(this.roomId, "SOUND_EFFECT_QUEUED", {
      roomId: this.roomId,
      url: params.url,
      volume: params.volume ?? 1.0,
    })
  }

  /**
   * Queue a screen effect (CSS animation) to be played on all clients in the room.
   */
  async queueScreenEffect(params: {
    target: ScreenEffectTarget
    targetId?: string
    effect: ScreenEffectName
    duration?: number
  }): Promise<void> {
    if (!this.roomId) {
      console.warn("[PluginAPI] Cannot queue screen effect: room context not set")
      return
    }

    if (!this.context.systemEvents) {
      console.warn("[PluginAPI] systemEvents not available, cannot queue screen effect")
      return
    }

    await this.context.systemEvents.emit(this.roomId, "SCREEN_EFFECT_QUEUED", {
      roomId: this.roomId,
      target: params.target,
      targetId: params.targetId,
      effect: params.effect,
      duration: params.duration,
    })
  }
}
