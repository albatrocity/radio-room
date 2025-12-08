import {
  AppContext,
  PluginAPI,
  QueueItem,
  Reaction,
  User,
  ReactionSubject,
  ChatMessage,
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
  ): Promise<void> {
    const { default: sendMessage } = await import("../../lib/sendMessage")
    const { default: systemMessage } = await import("../../lib/systemMessage")

    const msg = systemMessage(message, meta)

    await sendMessage(this.io, roomId, msg, this.context)
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

  /**
   * Emit a custom plugin event.
   * Events are namespaced as PLUGIN:{pluginName}:{eventName}
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

    // Broadcast to room via Socket.IO
    this.io.to(getRoomPath(this.roomId)).emit("event", {
      type: namespacedEvent,
      data: payload,
    })
  }
}
