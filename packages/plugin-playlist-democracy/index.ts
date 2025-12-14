import type {
  Plugin,
  PluginContext,
  PluginConfigSchema,
  PluginComponentSchema,
  PluginComponentState,
  QueueItem,
  ReactionPayload,
  PluginAugmentationData,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import {
  playlistDemocracyConfigSchema,
  defaultPlaylistDemocracyConfig,
  type PlaylistDemocracyConfig,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  PluginExportAugmentation,
  PluginMarkdownContext,
  RoomExportData,
} from "../../node_modules/@repo/types/RoomExport"

export type { PlaylistDemocracyConfig } from "./types"
export { playlistDemocracyConfigSchema, defaultPlaylistDemocracyConfig } from "./types"

// ============================================================================
// Constants
// ============================================================================

const COMPETITIVE_LEADERBOARD_KEY = "competitive-leaderboard"

// ============================================================================
// Component State Type
// ============================================================================

interface LeaderboardEntry {
  score: number
  value: string
}

interface UserLeaderboardEntry extends LeaderboardEntry {
  /** Username for display (looked up from user data, falls back to userId if not found) */
  username: string
}

export interface PlaylistDemocracyComponentState extends PluginComponentState {
  competitiveLeaderboard: UserLeaderboardEntry[]
  competitiveModeEnabled: boolean
}

// ============================================================================
// Plugin Implementation
// ============================================================================

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
    "Automatically skip tracks that don't receive enough reactions from listeners within a time limit."

  static readonly configSchema = playlistDemocracyConfigSchema
  static readonly defaultConfig = defaultPlaylistDemocracyConfig

  private readonly activeTimers = new Map<string, NodeJS.Timeout>()

  // ============================================================================
  // Schema Methods
  // ============================================================================

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  // ============================================================================
  // Component State
  // ============================================================================

  async getComponentState(): Promise<PlaylistDemocracyComponentState> {
    if (!this.context) {
      return {
        showCountdown: false,
        trackStartTime: null,
        isSkipped: false,
        voteCount: 0,
        requiredCount: 0,
        competitiveLeaderboard: [],
        competitiveModeEnabled: false,
      }
    }

    const config = await this.getConfig()
    if (!config?.enabled) {
      return this.createDisabledState(config)
    }

    const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)
    if (!nowPlaying?.playedAt) {
      return this.createWaitingState(config)
    }

    return this.createActiveState(nowPlaying, config)
  }

  private async createDisabledState(
    config: PlaylistDemocracyConfig | null,
  ): Promise<PlaylistDemocracyComponentState> {
    const competitiveLeaderboard = await this.getCompetitiveLeaderboard()
    return {
      showCountdown: false,
      trackStartTime: null,
      isSkipped: false,
      voteCount: 0,
      requiredCount: 0,
      competitiveLeaderboard,
      competitiveModeEnabled: config?.competitiveModeEnabled ?? false,
    }
  }

  private async createWaitingState(
    config: PlaylistDemocracyConfig,
  ): Promise<PlaylistDemocracyComponentState> {
    const competitiveLeaderboard = await this.getCompetitiveLeaderboard()
    return {
      showCountdown: true,
      trackStartTime: null,
      isSkipped: false,
      voteCount: 0,
      requiredCount: 0,
      competitiveLeaderboard,
      competitiveModeEnabled: config.competitiveModeEnabled,
    }
  }

  private async createActiveState(
    nowPlaying: QueueItem,
    config: PlaylistDemocracyConfig,
  ): Promise<PlaylistDemocracyComponentState> {
    const trackId = nowPlaying.mediaSource.trackId
    const trackStartTime = new Date(nowPlaying.playedAt!).getTime()

    // Fetch skip data and vote count in parallel
    const [skipDataStr, voteCountStr] = (await this.context!.storage.pipeline([
      { op: "get", key: `skipped:${trackId}` },
      { op: "get", key: this.makeVoteKey(trackId) },
    ])) as [string | null, string | null]

    const competitiveLeaderboard = await this.getCompetitiveLeaderboard()

    const skipData = this.parseSkipData(skipDataStr)
    if (skipData) {
      return {
        showCountdown: false,
        trackStartTime,
        isSkipped: true,
        voteCount: skipData.voteCount,
        requiredCount: skipData.requiredCount,
        competitiveLeaderboard,
        competitiveModeEnabled: config.competitiveModeEnabled,
      }
    }

    const listeningUsers = await this.context!.api.getUsers(this.context!.roomId)

    // Check if timer has already expired (track passed the threshold without being skipped)
    const elapsed = Date.now() - trackStartTime
    const timerExpired = elapsed >= config.timeLimit

    return {
      showCountdown: !timerExpired,
      trackStartTime,
      isSkipped: false,
      voteCount: Number(voteCountStr || 0),
      requiredCount: this.calculateRequiredVotes(listeningUsers.length, config),
      competitiveLeaderboard,
      competitiveModeEnabled: config.competitiveModeEnabled,
    }
  }

  private async getCompetitiveLeaderboard(): Promise<UserLeaderboardEntry[]> {
    if (!this.context) return []

    const rawLeaderboard = await this.context.storage.zrangeWithScores(
      COMPETITIVE_LEADERBOARD_KEY,
      0,
      -1,
    )

    // Hydrate with usernames
    const userIds = rawLeaderboard.map((entry) => entry.value)
    const users = await this.context.api.getUsersByIds(userIds)
    const userMap = new Map(users.map((u) => [u.userId, u.username]))

    return rawLeaderboard.map((entry) => ({
      ...entry,
      username: userMap.get(entry.value) ?? entry.value,
    }))
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
    this.on("ROOM_DELETED", this.onRoomDeleted.bind(this))
    this.on("REACTION_ADDED", this.onReactionAdded.bind(this))
    this.on("REACTION_REMOVED", this.onReactionRemoved.bind(this))
    this.on("USER_LEFT", this.onUserLeave.bind(this))
    this.onConfigChange(this.handleConfigChange.bind(this))
  }

  protected async onCleanup(): Promise<void> {
    this.clearAllTimers()
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    const { track } = data
    const trackId = track.mediaSource.trackId

    console.log(`[${this.name}] Track changed: ${track.title} (${trackId})`)

    await this.emitTrackStarted(track, config)
    this.startTrackTimer(trackId, track.title, config)
  }

  private async onReactionAdded(data: {
    roomId: string
    reaction: ReactionPayload
  }): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled || !data.reaction) return

    const { isVote } = await this.parseReaction(data.reaction, config)
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

    const { isVote } = await this.parseReaction(data.reaction, config)
    if (!isVote) return

    await this.context.storage.dec(this.makeVoteKey(data.reaction.reactTo.id))
  }

  private async onRoomDeleted(): Promise<void> {
    console.log(`[${this.name}] Room deleted, cleaning up`)
    await this.cleanup()
  }

  private async onUserLeave(): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    const users = await this.context.api.getUsers(this.context.roomId)
    const hasAdmins = users.some((u) => u.isAdmin)

    if (!hasAdmins) {
      await this.disablePluginNoAdmins()
    }
  }

  // ============================================================================
  // Config Change Handling
  // ============================================================================

  private async handleConfigChange(data: {
    roomId: string
    pluginName: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    if (!this.context) return

    const config = data.config as PlaylistDemocracyConfig
    const previousConfig = data.previousConfig as PlaylistDemocracyConfig | null
    const wasEnabled = previousConfig?.enabled === true
    const isEnabled = config?.enabled === true

    console.log(`[${this.name}] Config changed:`, { wasEnabled, isEnabled })

    if (!wasEnabled && isEnabled) {
      await this.onPluginEnabled(config)
    } else if (wasEnabled && !isEnabled) {
      await this.onPluginDisabled()
    } else if (wasEnabled && isEnabled && previousConfig) {
      await this.onPluginConfigUpdated(config, previousConfig)
    }
  }

  private async onPluginEnabled(config: PlaylistDemocracyConfig): Promise<void> {
    await this.sendRulesMessage(config, "enabled")

    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    if (!nowPlaying?.playedAt) return

    const trackId = nowPlaying.mediaSource.trackId
    const playedAt = new Date(nowPlaying.playedAt).getTime()
    const remaining = config.timeLimit - (Date.now() - playedAt)

    if (remaining > 0) {
      console.log(
        `[${this.name}] Starting monitoring for current track ${trackId} with ${remaining}ms remaining`,
      )

      await this.emit("TRACK_STARTED", { showCountdown: true, trackStartTime: playedAt })
      this.startTimerWithDuration(trackId, nowPlaying.title, config, remaining)
    }
  }

  private async onPluginDisabled(): Promise<void> {
    this.clearAllTimers()
    await this.emit("PLUGIN_DISABLED", { showCountdown: false, trackStartTime: null })
    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `🗳️ Playlist Democracy disabled`,
      { type: "alert", status: "info" },
    )
  }

  private async onPluginConfigUpdated(
    config: PlaylistDemocracyConfig,
    previousConfig: PlaylistDemocracyConfig,
  ): Promise<void> {
    const rulesChanged =
      config.reactionType !== previousConfig.reactionType ||
      config.timeLimit !== previousConfig.timeLimit ||
      config.thresholdType !== previousConfig.thresholdType ||
      config.thresholdValue !== previousConfig.thresholdValue

    if (rulesChanged) {
      await this.sendRulesMessage(config, "updated")
    }
  }

  // ============================================================================
  // Timer Management
  // ============================================================================

  private startTrackTimer(
    trackId: string,
    trackTitle: string,
    config: PlaylistDemocracyConfig,
  ): void {
    this.clearTimer(trackId)
    this.startTimerWithDuration(trackId, trackTitle, config, config.timeLimit)
    console.log(`[${this.name}] Started monitoring track ${trackId} for ${config.timeLimit}ms`)
  }

  private startTimerWithDuration(
    trackId: string,
    trackTitle: string,
    config: PlaylistDemocracyConfig,
    duration: number,
  ): void {
    const timeout = setTimeout(async () => {
      await this.checkThresholdAndSkip(trackId, trackTitle, config)
      this.activeTimers.delete(trackId)
    }, duration)

    this.activeTimers.set(trackId, timeout)
  }

  private clearTimer(trackId: string): void {
    const timer = this.activeTimers.get(trackId)
    if (timer) {
      clearTimeout(timer)
      this.activeTimers.delete(trackId)
    }
  }

  private clearAllTimers(): void {
    this.activeTimers.forEach((timeout, trackId) => {
      clearTimeout(timeout)
      console.log(`[${this.name}] Cleared timer for track ${trackId}`)
    })
    this.activeTimers.clear()
  }

  // ============================================================================
  // Threshold Logic
  // ============================================================================

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
      const voteCount = Number((await this.context.storage.get(this.makeVoteKey(trackId))) || 0)
      const requiredCount = this.calculateRequiredVotes(totalListeners, config)
      const thresholdMet = voteCount >= requiredCount

      console.log(
        `[${this.name}] Threshold check: ${voteCount}/${requiredCount} (met: ${thresholdMet})`,
      )

      if (thresholdMet) {
        console.log(`[${this.name}] Threshold met, track will continue playing`)

        // Award point to the user who queued the track (if competitive mode is enabled)
        await this.awardCompetitivePoint(trackId, config)

        // Hide countdown - track passed the vote
        await this.emit("THRESHOLD_MET", {
          showCountdown: false,
          voteCount,
          requiredCount,
        })
      } else {
        // Check if we should skip based on queue length
        if (config.skipRequiresQueue) {
          const queue = await this.context!.api.getQueue(this.context!.roomId)
          const queueLength = queue.length

          if (queueLength <= config.skipRequiresQueueMin) {
            console.log(
              `[${this.name}] Threshold not met, but queue too short (${queueLength} <= ${config.skipRequiresQueueMin}), not skipping`,
            )

            // Still award point since we're not actually skipping
            await this.awardCompetitivePoint(trackId, config)

            // Hide countdown - track didn't pass vote but we're not skipping due to queue
            await this.emit("THRESHOLD_NOT_MET_QUEUE_SHORT", {
              showCountdown: false,
              voteCount,
              requiredCount,
              queueLength,
              skipRequiresQueueMin: config.skipRequiresQueueMin,
            })
            return
          }
        }

        await this.context.api.queueScreenEffect({
          target: "nowPlaying",
          targetId: trackId,
          effect: "headShake",
          duration: 1000,
        })
        await this.skipTrack(trackId, trackTitle, config, voteCount, requiredCount, totalListeners)
      }
    } catch (error) {
      console.error(`[${this.name}] Error checking threshold:`, error)
    }
  }

  private async awardCompetitivePoint(
    trackId: string,
    config: PlaylistDemocracyConfig,
  ): Promise<void> {
    if (!this.context || !config.competitiveModeEnabled) return

    // Get the now playing track to find who queued it
    const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)
    if (!nowPlaying?.addedBy?.userId) {
      console.log(`[${this.name}] No user found for track ${trackId}, skipping competitive point`)
      return
    }

    const userId = nowPlaying.addedBy.userId
    console.log(
      `[${this.name}] Awarding 1 competitive point to user ${userId} for track ${trackId}`,
    )

    // Increment the user's score in the leaderboard
    await this.context.storage.zincrby(COMPETITIVE_LEADERBOARD_KEY, 1, userId)

    // Get updated leaderboard and emit to frontend
    const competitiveLeaderboard = await this.getCompetitiveLeaderboard()

    await this.emit("COMPETITIVE_POINT_AWARDED", {
      userId,
      trackId,
      competitiveLeaderboard,
    })

    await this.context.api.queueScreenEffect({
      target: "user",
      targetId: userId,
      effect: "pulse",
    })
  }

  private async skipTrack(
    trackId: string,
    trackTitle: string,
    config: PlaylistDemocracyConfig,
    voteCount: number,
    requiredCount: number,
    totalListeners: number,
  ): Promise<void> {
    if (!this.context) return

    console.log(`[${this.name}] Skipping track ${trackId}`)

    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    await this.context!.api.skipTrack(this.context!.roomId, trackId)

    const skipData = {
      trackId,
      trackTitle,
      timestamp: Date.now(),
      voteCount,
      requiredCount,
      totalListeners,
    }
    await this.context!.storage.set(`skipped:${trackId}`, JSON.stringify(skipData))

    if (nowPlaying) {
      const existingPluginData = nowPlaying.pluginData ?? {}
      await this.context!.api.updatePlaylistTrack(this.context!.roomId, {
        ...nowPlaying,
        pluginData: { ...existingPluginData, [this.name]: { skipped: true, skipData } },
      })
    }

    await this.emit("TRACK_SKIPPED", { isSkipped: true, voteCount, requiredCount })

    if (config.soundEffectOnSkip && this.context) {
      const url =
        config.soundEffectOnSkipUrl ??
        "https://cdn.freesound.org/previews/650/650842_11771918-lq.mp3"
      await this.context.api.queueSoundEffect({ url, volume: 0.6 })
    }

    await this.sendSkipMessage(trackTitle, config, voteCount, requiredCount, totalListeners)
  }

  private calculateRequiredVotes(listenerCount: number, config: PlaylistDemocracyConfig): number {
    return config.thresholdType === "percentage"
      ? Math.ceil((listenerCount * config.thresholdValue) / 100)
      : config.thresholdValue
  }

  // ============================================================================
  // Augmentation
  // ============================================================================

  async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
    if (!this.context) return {}

    const config = await this.getConfig()
    if (!config?.enabled) return {}

    const skipData = this.parseSkipData(
      await this.context.storage.get(`skipped:${item.mediaSource.trackId}`),
    )
    if (!skipData) return {}

    return {
      skipped: true,
      skipData,
      styles: { title: { textDecoration: "line-through", opacity: 0.7 } },
    }
  }

  async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
    if (!this.context || items.length === 0) {
      return items.map(() => ({}))
    }

    const skipKeys = items.map((item) => `skipped:${item.mediaSource.trackId}`)
    const skipDataStrings = await this.context.storage.mget(skipKeys)

    return skipDataStrings.map((dataStr) => {
      const skipData = this.parseSkipData(dataStr)
      return skipData ? { skipped: true, skipData } : {}
    })
  }

  async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
    // Count tracks that were skipped by this plugin
    const skippedTracks = exportData.playlist.filter(
      (item) => item.pluginData?.["playlist-democracy"]?.skipped,
    )

    // Calculate stats
    const totalSkipped = skippedTracks.length
    const totalVotes = skippedTracks.reduce(
      (sum, item) => sum + (item.pluginData?.["playlist-democracy"]?.skipData?.voteCount || 0),
      0,
    )

    return {
      // Data added to export.pluginExports["playlist-democracy"]
      data: {
        totalSkipped,
        totalVotes,
        averageVotesPerSkip: totalSkipped > 0 ? totalVotes / totalSkipped : 0,
      },

      // Additional markdown sections appended to export
      markdownSections: [
        `## Playlist Democracy Stats\n\n` +
          `- **Tracks Skipped:** ${totalSkipped}\n` +
          `- **Total Votes Cast:** ${totalVotes}\n` +
          `- **Average Votes per Skip:** ${(totalVotes / totalSkipped).toFixed(1)}`,
      ],
    }
  }

  formatPluginDataMarkdown(pluginData: unknown, context: PluginMarkdownContext): string | null {
    // Only format for playlist items
    if (context.type !== "playlist") return null

    const data = pluginData as {
      skipped?: boolean
      skipData?: { voteCount: number; requiredCount: number }
    }

    if (!data.skipped || !data.skipData) return null

    const { voteCount, requiredCount } = data.skipData
    return `⏭️ Skipped (${voteCount}/${requiredCount} votes)`
  }

  // ============================================================================
  // Actions
  // ============================================================================

  async executeAction(action: string): Promise<{ success: boolean; message?: string }> {
    if (action === "resetCompetitiveLeaderboard") {
      return this.resetCompetitiveLeaderboard()
    }
    return { success: false, message: `Unknown action: ${action}` }
  }

  private async resetCompetitiveLeaderboard(): Promise<{ success: boolean; message?: string }> {
    if (!this.context) {
      return { success: false, message: "Plugin not initialized" }
    }

    try {
      // Get all entries and remove them
      const leaderboard = await this.context.storage.zrangeWithScores(
        COMPETITIVE_LEADERBOARD_KEY,
        0,
        -1,
      )

      for (const entry of leaderboard) {
        await this.context.storage.zrem(COMPETITIVE_LEADERBOARD_KEY, entry.value)
      }

      console.log(`[${this.name}] Competitive leaderboard reset for room ${this.context.roomId}`)

      // Emit event to update frontend with empty leaderboard
      await this.emit("COMPETITIVE_LEADERBOARD_RESET", {
        competitiveLeaderboard: [],
      })

      return { success: true, message: "Leaderboard has been reset" }
    } catch (error) {
      console.error(`[${this.name}] Error resetting competitive leaderboard:`, error)
      return { success: false, message: `Error resetting leaderboard: ${error}` }
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async parseReaction(
    reaction: ReactionPayload,
    config: PlaylistDemocracyConfig,
  ): Promise<{ isVote: boolean; trackId: string | null }> {
    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    if (!nowPlaying) return { isVote: false, trackId: null }

    const trackId = nowPlaying.mediaSource.trackId
    const isCurrentTrack = reaction.reactTo.type === "track" && reaction.reactTo.id === trackId
    const isCorrectEmoji = reaction.emoji.shortcodes === `:${config.reactionType}:`

    return { isVote: isCurrentTrack && isCorrectEmoji, trackId }
  }

  private parseSkipData(
    dataStr: string | null,
  ): { voteCount: number; requiredCount: number } | null {
    if (!dataStr) return null
    try {
      return JSON.parse(dataStr)
    } catch {
      return null
    }
  }

  private makeVoteKey(trackId: string): string {
    return `track:${trackId}:votes`
  }

  private async emitTrackStarted(track: QueueItem, config: PlaylistDemocracyConfig): Promise<void> {
    const listeningUsers = await this.context!.api.getUsers(this.context!.roomId)
    const requiredCount = this.calculateRequiredVotes(listeningUsers.length, config)

    if (track.playedAt) {
      await this.emit("TRACK_STARTED", {
        showCountdown: true,
        trackStartTime: track.playedAt,
        isSkipped: false,
        voteCount: 0,
        requiredCount,
      })
    }
  }

  private async sendRulesMessage(
    config: PlaylistDemocracyConfig,
    action: "enabled" | "updated",
  ): Promise<void> {
    const timeSeconds = Math.floor(config.timeLimit / 1000)
    const thresholdText =
      config.thresholdType === "percentage"
        ? `${config.thresholdValue}%`
        : `${config.thresholdValue}`

    await this.context!.api.queueScreenEffect({
      target: "nowPlaying",
      targetId: "latest",
      effect: "pulse",
      duration: 500,
    })

    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `🗳️ Playlist Democracy ${action}: Tracks need ${thresholdText} :${config.reactionType}: reactions within ${timeSeconds} seconds`,
      { type: "alert", status: "info" },
    )
  }

  private async sendSkipMessage(
    trackTitle: string,
    config: PlaylistDemocracyConfig,
    voteCount: number,
    requiredCount: number,
    totalListeners: number,
  ): Promise<void> {
    let voteText: string
    if (config.thresholdType === "percentage") {
      const percentage = totalListeners > 0 ? Math.floor((voteCount / totalListeners) * 100) : 0
      voteText = `${percentage}%`
    } else {
      voteText = `${voteCount}`
    }

    const thresholdText =
      config.thresholdType === "percentage" ? `${config.thresholdValue}%` : `${requiredCount}`

    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `⏭️ Track skipped: "${trackTitle}" didn't receive enough :${config.reactionType}: reactions (${voteText} / ${thresholdText})`,
    )
  }

  private async disablePluginNoAdmins(): Promise<void> {
    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `No more admins left in the room, stopping playlist democracy`,
      { type: "alert", status: "info" },
    )

    const currentConfig = await this.getConfig()
    await this.context!.api.setPluginConfig(this.context!.roomId, this.name, {
      ...currentConfig,
      enabled: false,
    })

    // Note: Don't call cleanup() here - that destroys the plugin context.
    // Just clear timers; the config change handler will emit PLUGIN_DISABLED.
    this.clearAllTimers()
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function to create the plugin.
 * A new instance is created for each room.
 */
export function createPlaylistDemocracyPlugin(
  configOverrides?: Partial<PlaylistDemocracyConfig>,
): Plugin {
  return new PlaylistDemocracyPlugin(configOverrides)
}

export default createPlaylistDemocracyPlugin
