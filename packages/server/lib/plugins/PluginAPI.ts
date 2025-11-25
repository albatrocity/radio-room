import { AppContext, PluginAPI, QueueItem, Reaction, User, ReactionSubject } from "@repo/types"
import { Server } from "socket.io"

/**
 * Implementation of the Plugin API
 * Provides safe, high-level methods for plugins to interact with the system
 */
export class PluginAPIImpl implements PluginAPI {
  constructor(
    private context: AppContext,
    private io: Server,
  ) {}

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

  async sendSystemMessage(roomId: string, message: string): Promise<void> {
    const { default: sendMessage } = await import("../../lib/sendMessage")
    const { default: systemMessage } = await import("../../lib/systemMessage")

    const msg = systemMessage(message)

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
}
