import type { Plugin, PluginContext, QueueItem, ReactionPayload } from "@repo/types"
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
 * This plugin is completely self-contained and interacts with the system
 * only through the provided PluginContext API.
 */
export class PlaylistDemocracyPlugin extends BasePlugin<PlaylistDemocracyConfig> {
  name = "playlist-democracy"
  version = packageJson.version
  description =
    "A plugin that monitors track reactions and automatically skips tracks that don't meet a configurable threshold within a time limit."

  private activeTimers: Map<string, NodeJS.Timeout> = new Map()

  async register(context: PluginContext): Promise<void> {
    this.context = context

    // Register for lifecycle events
    context.lifecycle.on("trackChanged", this.onTrackChanged.bind(this))
    context.lifecycle.on("roomDeleted", this.onRoomDeleted.bind(this))
    context.lifecycle.on("configChanged", this.onConfigChanged.bind(this))
    context.lifecycle.on("reactionAdded", this.onReactionAdded.bind(this))
    context.lifecycle.on("reactionRemoved", this.onReactionRemoved.bind(this))

    console.log(`[${this.name}] Registered for room ${context.roomId}`)
  }

  /**
   * Custom cleanup - clear all active timers
   * Storage cleanup is handled automatically by BasePlugin
   */
  protected async onCleanup(): Promise<void> {
    Array.from(this.activeTimers.entries()).forEach(([trackId, timeout]) => {
      clearTimeout(timeout)
      console.log(`[${this.name}] Cleared timer for track ${trackId}`)
    })
    this.activeTimers.clear()
  }

  /**
   * Helper to check if plugin is currently enabled
   */
  private async isEnabled(): Promise<boolean> {
    const config = await this.getConfig()
    return config?.enabled === true
  }

  private async parseReaction(
    reaction: ReactionPayload,
  ): Promise<{ isVote: boolean; trackId: string | null }> {
    if (!this.context) return { isVote: false, trackId: null }
    const config = await this.getConfig()
    const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)

    if (!nowPlaying) {
      return {
        isVote: false,
        trackId: null,
      }
    }

    if (
      reaction.reactTo.type !== "track" ||
      reaction.reactTo.id !== nowPlaying.mediaSource.trackId
    ) {
      return {
        isVote: false,
        trackId: nowPlaying.mediaSource.trackId,
      }
    }

    if (reaction.emoji.shortcodes !== `:${config?.reactionType}:`) {
      return {
        isVote: false,
        trackId: nowPlaying.mediaSource.trackId,
      }
    }

    return {
      isVote: true,
      trackId: nowPlaying.mediaSource.trackId,
    }
  }

  private async onConfigChanged(data: {
    roomId: string
    config: any
    previousConfig: any
  }): Promise<void> {
    console.log("onConfigChanged", data)
    if (!this.context) return

    const { config, previousConfig } = data
    const wasEnabled = previousConfig?.enabled === true
    const isEnabled = config?.enabled === true

    console.log(`[${this.name}] Config changed:`, { wasEnabled, isEnabled, config })

    // Handle enable state changes
    if (!wasEnabled && isEnabled) {
      // Plugin was just enabled
      console.log(`[${this.name}] Plugin enabled with config:`, config)

      const timeSeconds = Math.floor(config.timeLimit / 1000)
      const thresholdText =
        config.thresholdType === "percentage"
          ? `${config.thresholdValue}%`
          : `${config.thresholdValue}`

      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `🗳️ Playlist Democracy enabled: Tracks need ${thresholdText} :${config.reactionType}: reactions within ${timeSeconds} seconds`,
      )
    } else if (wasEnabled && !isEnabled) {
      // Plugin was just disabled
      console.log(`[${this.name}] Plugin disabled`)

      // Clear any active timers
      Array.from(this.activeTimers.entries()).forEach(([trackId, timeout]) => {
        clearTimeout(timeout)
        console.log(`[${this.name}] Cleared timer for track ${trackId}`)
      })
      this.activeTimers.clear()

      await this.context.api.sendSystemMessage(
        this.context.roomId,
        `🗳️ Playlist Democracy disabled`,
      )
    } else if (wasEnabled && isEnabled) {
      // Plugin remains enabled but config may have changed
      console.log(`[${this.name}] Config updated while enabled`)

      // Check if any rules changed
      const rulesChanged =
        config.reactionType !== previousConfig.reactionType ||
        config.timeLimit !== previousConfig.timeLimit ||
        config.thresholdType !== previousConfig.thresholdType ||
        config.thresholdValue !== previousConfig.thresholdValue

      if (rulesChanged) {
        // Send system message with updated rules
        const timeSeconds = Math.floor(config.timeLimit / 1000)
        const thresholdText =
          config.thresholdType === "percentage"
            ? `${config.thresholdValue}%`
            : `${config.thresholdValue}`

        await this.context.api.sendSystemMessage(
          this.context.roomId,
          `🗳️ Playlist Democracy rules updated: Tracks need ${thresholdText} :${config.reactionType}: reactions within ${timeSeconds} seconds`,
        )
      }
    }
  }

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    if (!this.context) return

    // Get plugin configuration
    const config = await this.getConfig()
    if (!config || !config.enabled) {
      return
    }

    const { track } = data
    const trackId = track.mediaSource.trackId

    console.log(`[${this.name}] Track changed: ${track.title} (${trackId})`)

    // Clear any existing timer
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
    if (!config || !config.enabled || !data.reaction) return

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

    if (!config || !config.enabled || !data.reaction) return
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

      // Get listening users
      const listeningUsers = await this.context.api.getUsers(this.context.roomId)
      const totalListeners = listeningUsers.length

      console.log(`[${this.name}] Total listening users: ${totalListeners}`)

      const voteCount = Number((await this.context.storage.get(this.makeVoteKey(trackId))) || 0)

      // Calculate required count
      let requiredCount: number
      if (config.thresholdType === "percentage") {
        requiredCount = Math.ceil((totalListeners * config.thresholdValue) / 100)
      } else {
        requiredCount = config.thresholdValue
      }

      const thresholdMet = voteCount >= requiredCount

      console.log(
        `[${this.name}] Threshold check: ${voteCount}/${requiredCount} (met: ${thresholdMet})`,
      )

      if (!thresholdMet) {
        // Skip the track
        console.log(`[${this.name}] Skipping track ${trackId}`)

        await this.context.api.skipTrack(this.context.roomId, trackId)

        // Store skip info in plugin storage
        await this.context.storage.set(
          `skipped:${trackId}`,
          JSON.stringify({
            trackId,
            trackTitle,
            timestamp: Date.now(),
            voteCount,
            requiredCount,
            totalListeners,
          }),
        )

        // Send system message
        let voteText: string
        let thresholdText: string

        if (config.thresholdType === "percentage") {
          // Calculate percentage of votes received
          const votePercentage =
            totalListeners > 0 ? Math.floor((voteCount / totalListeners) * 100) : 0
          voteText = `${votePercentage}%`
          thresholdText = `${config.thresholdValue}%`
        } else {
          voteText = `${voteCount}`
          thresholdText = `${requiredCount}`
        }

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

  private makeVoteKey(trackId: string): string {
    if (!this.context) return ""
    return `track:${trackId}:votes`
  }
}

/**
 * Factory function to create the plugin
 */
export function createPlaylistDemocracyPlugin(): Plugin {
  return new PlaylistDemocracyPlugin()
}

// Default export
export default createPlaylistDemocracyPlugin
