import type {
  Plugin,
  PluginContext,
  QueueItem,
  ReactionPayload,
  PluginAugmentationData,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import type { PlaylistDemocracyConfig } from "./types"

export type { PlaylistDemocracyConfig } from "./types"

/**
 * Playlist Democracy Plugin
 *
 * Monitors track reactions and automatically skips tracks that don't meet
 * a configurable threshold within a time limit.
 *
 * ARCHITECTURE: Each instance handles exactly ONE room.
 * The PluginRegistry creates a new instance for each room.
 */
export class PlaylistDemocracyPlugin extends BasePlugin<PlaylistDemocracyConfig> {
  name = "playlist-democracy"
  version = packageJson.version
  description =
    "A plugin that monitors track reactions and automatically skips tracks that don't meet a configurable threshold within a time limit."

  private activeTimers: Map<string, NodeJS.Timeout> = new Map()

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    // Register for lifecycle events
    context.lifecycle.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
    context.lifecycle.on("ROOM_DELETED", this.onRoomDeleted.bind(this))
    context.lifecycle.on("CONFIG_CHANGED", this.onConfigChanged.bind(this))
    context.lifecycle.on("REACTION_ADDED", this.onReactionAdded.bind(this))
    context.lifecycle.on("REACTION_REMOVED", this.onReactionRemoved.bind(this))
    context.lifecycle.on("USER_LEFT", this.onUserLeave.bind(this))
  }

  /**
   * Custom cleanup - clear all active timers
   * Storage cleanup is handled automatically by BasePlugin
   */
  protected async onCleanup(): Promise<void> {
    for (const [trackId, timeout] of this.activeTimers.entries()) {
      clearTimeout(timeout)
      console.log(`[${this.name}] Cleared timer for track ${trackId}`)
    }
    this.activeTimers.clear()
  }

  private async parseReaction(
    reaction: ReactionPayload,
  ): Promise<{ isVote: boolean; trackId: string | null }> {
    if (!this.context) return { isVote: false, trackId: null }

    const config = await this.getConfig()
    const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)

    if (!nowPlaying) {
      return { isVote: false, trackId: null }
    }

    if (
      reaction.reactTo.type !== "track" ||
      reaction.reactTo.id !== nowPlaying.mediaSource.trackId
    ) {
      return { isVote: false, trackId: nowPlaying.mediaSource.trackId }
    }

    if (reaction.emoji.shortcodes !== `:${config?.reactionType}:`) {
      return { isVote: false, trackId: nowPlaying.mediaSource.trackId }
    }

    return { isVote: true, trackId: nowPlaying.mediaSource.trackId }
  }

  private async onConfigChanged(data: {
    roomId: string
    config: any
    previousConfig: any
  }): Promise<void> {
    if (!this.context) return

    const { config, previousConfig } = data
    const wasEnabled = previousConfig?.enabled === true
    const isEnabled = config?.enabled === true

    console.log(`[${this.name}] Config changed:`, { wasEnabled, isEnabled, config })

    if (!wasEnabled && isEnabled) {
      // Plugin was just enabled
      const timeSeconds = Math.floor(config.timeLimit / 1000)
      const thresholdText =
        config.thresholdType === "percentage"
          ? `${config.thresholdValue}%`
          : `${config.thresholdValue}`

      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `🗳️ Playlist Democracy enabled: Tracks need ${thresholdText} :${config.reactionType}: reactions within ${timeSeconds} seconds`,
        { type: "alert", status: "info" },
      )
    } else if (wasEnabled && !isEnabled) {
      // Plugin was just disabled - clear timers
      for (const [trackId, timeout] of this.activeTimers.entries()) {
        clearTimeout(timeout)
        console.log(`[${this.name}] Cleared timer for track ${trackId}`)
      }
      this.activeTimers.clear()

      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `🗳️ Playlist Democracy disabled`,
        { type: "alert", status: "info" },
      )
    } else if (wasEnabled && isEnabled) {
      // Config updated while enabled
      const rulesChanged =
        config.reactionType !== previousConfig.reactionType ||
        config.timeLimit !== previousConfig.timeLimit ||
        config.thresholdType !== previousConfig.thresholdType ||
        config.thresholdValue !== previousConfig.thresholdValue

      if (rulesChanged) {
        const timeSeconds = Math.floor(config.timeLimit / 1000)
        const thresholdText =
          config.thresholdType === "percentage"
            ? `${config.thresholdValue}%`
            : `${config.thresholdValue}`

        await this.context.api.sendSystemMessage(
          this.context.roomId,
          `🗳️ Playlist Democracy rules updated: Tracks need ${thresholdText} :${config.reactionType}: reactions within ${timeSeconds} seconds`,
          { type: "alert", status: "info" },
        )
      }
    }
  }

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    const { track } = data
    const trackId = track.mediaSource.trackId

    console.log(`[${this.name}] Track changed: ${track.title} (${trackId})`)

    // Clear any existing timer for this track
    this.clearTimer(trackId)

    // Start monitoring timer
    const timeout = setTimeout(async () => {
      await this.checkThresholdAndSkip(trackId, track.title, config)
      this.activeTimers.delete(trackId)
    }, config.timeLimit)

    this.activeTimers.set(trackId, timeout)
    console.log(`[${this.name}] Started monitoring track ${trackId} for ${config.timeLimit}ms`)
  }

  private async onReactionAdded(data: {
    roomId: string
    reaction: ReactionPayload
  }): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled || !data.reaction) return

    const { isVote } = await this.parseReaction(data.reaction)
    if (!isVote) return

    await this.context.storage.inc(this.makeVoteKey(data.reaction.reactTo.id))
  }

  private async onReactionRemoved(data: {
    roomId: string
    reaction: ReactionPayload
  }): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled || !data.reaction) return

    const { isVote } = await this.parseReaction(data.reaction)
    if (!isVote) return

    await this.context.storage.dec(this.makeVoteKey(data.reaction.reactTo.id))
  }

  private async onRoomDeleted(): Promise<void> {
    console.log(`[${this.name}] Room deleted, cleaning up`)
    await this.cleanup()
  }

  private clearTimer(trackId: string): void {
    const existingTimer = this.activeTimers.get(trackId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.activeTimers.delete(trackId)
    }
  }

  private async checkThresholdAndSkip(
    trackId: string,
    trackTitle: string,
    config: PlaylistDemocracyConfig,
  ): Promise<void> {
    if (!this.context) return

    try {
      console.log(`[${this.name}] Checking threshold for track ${trackId}`)

      const listeningUsers = await this.context.api.getUsers(this.context.roomId)
      const totalListeners = listeningUsers.length
      console.log(`[${this.name}] Total listening users: ${totalListeners}`)

      const voteCount = Number((await this.context.storage.get(this.makeVoteKey(trackId))) || 0)

      // Calculate required count
      const requiredCount =
        config.thresholdType === "percentage"
          ? Math.ceil((totalListeners * config.thresholdValue) / 100)
          : config.thresholdValue

      const thresholdMet = voteCount >= requiredCount
      console.log(
        `[${this.name}] Threshold check: ${voteCount}/${requiredCount} (met: ${thresholdMet})`,
      )

      if (!thresholdMet) {
        console.log(`[${this.name}] Skipping track ${trackId}`)

        // Get the full track before skipping (we need it for the update event)
        const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)

        await this.context.api.skipTrack(this.context.roomId, trackId)

        // Store skip info
        const skipData = {
          trackId,
          trackTitle,
          timestamp: Date.now(),
          voteCount,
          requiredCount,
          totalListeners,
        }
        await this.context.storage.set(`skipped:${trackId}`, JSON.stringify(skipData))

        // Emit playlist track update with pluginData so frontend updates immediately
        if (nowPlaying) {
          const updatedTrack = {
            ...nowPlaying,
            pluginData: {
              ...(nowPlaying.pluginData || {}),
              [this.name]: { skipped: true, skipData },
            },
          }
          await this.context.api.updatePlaylistTrack(this.context.roomId, updatedTrack)
        }

        // Send system message
        const voteText =
          config.thresholdType === "percentage"
            ? `${totalListeners > 0 ? Math.floor((voteCount / totalListeners) * 100) : 0}%`
            : `${voteCount}`
        const thresholdText =
          config.thresholdType === "percentage" ? `${config.thresholdValue}%` : `${requiredCount}`

        await this.context.api.sendSystemMessage(
          this.context.roomId,
          `⏭️ Track skipped: "${trackTitle}" didn't receive enough :${config.reactionType}: reactions (${voteText} / ${thresholdText})`,
        )
      } else {
        console.log(`[${this.name}] Threshold met, track will continue playing`)
      }
    } catch (error) {
      console.error(`[${this.name}] Error checking threshold:`, error)
    }
  }

  private async onUserLeave(): Promise<void> {
    console.log("USER LEFT")
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    const users = await this.context.api.getUsers(this.context.roomId)

    // If no more admins, disable the plugin and cleanup
    if (users.filter((u) => u.isAdmin).length === 0) {
      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `No more admins left in the room, stopping playlist democracy`,
        { type: "alert", status: "info" },
      )

      const currentConfig = await this.getConfig()
      await this.context.api.setPluginConfig(this.context.roomId, this.name, {
        ...currentConfig,
        enabled: false,
      })

      await this.cleanup()
    }
  }

  private makeVoteKey(trackId: string): string {
    return `track:${trackId}:votes`
  }

  /**
   * Augment playlist items with skip information
   */
  async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
    if (!this.context || items.length === 0) {
      return items.map(() => ({}))
    }

    const trackIds = items.map((item) => item.mediaSource.trackId)
    const skipKeys = trackIds.map((id) => `skipped:${id}`)
    const skipDataStrings = await this.context.storage.mget(skipKeys)

    return skipDataStrings.map((dataStr) => {
      if (!dataStr) return {}
      try {
        return { skipped: true, skipData: JSON.parse(dataStr) }
      } catch {
        return {}
      }
    })
  }
}

/**
 * Factory function to create the plugin.
 * A new instance is created for each room.
 */
export function createPlaylistDemocracyPlugin(): Plugin {
  return new PlaylistDemocracyPlugin()
}

export default createPlaylistDemocracyPlugin
