import type {
  Plugin,
  PluginContext,
  PluginConfigSchema,
  PluginComponentSchema,
  PluginComponentState,
  PluginAugmentationData,
  QueueItem,
  User,
} from "@repo/types"
import type {
  PluginExportAugmentation,
  PluginMarkdownContext,
  RoomExportData,
} from "@repo/types/RoomExport"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import {
  absentDjConfigSchema,
  defaultAbsentDjConfig,
  type AbsentDjConfig,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"

export type { AbsentDjConfig } from "./types"
export { absentDjConfigSchema, defaultAbsentDjConfig } from "./types"

// ============================================================================
// Skip Data Type
// ============================================================================

interface SkipData {
  trackId: string
  trackTitle: string
  timestamp: number
  absentUsername: string
}

// ============================================================================
// Component State Type
// ============================================================================

export interface AbsentDjComponentState extends PluginComponentState {
  showCountdown: boolean
  countdownStartTime: number | null
  absentUsername: string | null
  isSkipped: boolean
}

// ============================================================================
// Timer Data Type
// ============================================================================

interface ActiveTimer {
  timeout: NodeJS.Timeout
  trackId: string
  absentUserId: string
  absentUsername: string
  trackTitle: string
  startTime: number
}

// ============================================================================
// Plugin Implementation
// ============================================================================

/**
 * Absent DJ Plugin
 *
 * Automatically skips tracks when the user who added them is not present
 * in the room, after a configurable countdown.
 *
 * ARCHITECTURE: Each instance handles exactly ONE room.
 * The PluginRegistry creates a new instance for each room.
 */
export class AbsentDjPlugin extends BasePlugin<AbsentDjConfig> {
  name = "absent-dj"
  version = packageJson.version
  description =
    "Automatically skip tracks when the DJ who added them is not present in the room."

  static readonly configSchema = absentDjConfigSchema
  static readonly defaultConfig = defaultAbsentDjConfig

  private activeTimer: ActiveTimer | null = null

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

  async getComponentState(): Promise<AbsentDjComponentState> {
    if (!this.context) {
      return {
        showCountdown: false,
        countdownStartTime: null,
        absentUsername: null,
        isSkipped: false,
      }
    }

    const config = await this.getConfig()
    if (!config?.enabled) {
      return {
        showCountdown: false,
        countdownStartTime: null,
        absentUsername: null,
        isSkipped: false,
      }
    }

    // If we have an active timer, show the countdown
    if (this.activeTimer) {
      return {
        showCountdown: true,
        countdownStartTime: this.activeTimer.startTime,
        absentUsername: this.activeTimer.absentUsername,
        isSkipped: false,
      }
    }

    return {
      showCountdown: false,
      countdownStartTime: null,
      absentUsername: null,
      isSkipped: false,
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
    this.on("USER_JOINED", this.onUserJoined.bind(this))
    this.on("ROOM_DELETED", this.onRoomDeleted.bind(this))
    this.onConfigChange(this.handleConfigChange.bind(this))
  }

  protected async onCleanup(): Promise<void> {
    this.clearTimer()
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    if (!this.context) return

    // Clear any existing timer from previous track
    this.clearTimer()

    // Reset isSkipped state when a new track starts
    await this.emit("TRACK_CHANGED", {
      showCountdown: false,
      countdownStartTime: null,
      absentUsername: null,
      isSkipped: false,
    })

    const config = await this.getConfig()
    if (!config?.enabled) return

    const { track } = data

    // Check if the track has an addedBy user
    if (!track.addedBy?.userId) {
      console.log(`[${this.name}] Track has no addedBy user, skipping check`)
      return
    }

    const addedByUserId = track.addedBy.userId
    const addedByUsername = track.addedBy.username ?? "Unknown DJ"

    // Check if the user who added the track is present
    const users = await this.context.api.getUsers(this.context.roomId)
    const isPresent = users.some((u) => u.userId === addedByUserId)

    if (isPresent) {
      console.log(`[${this.name}] DJ ${addedByUsername} is present, no action needed`)
      return
    }

    // Check queue length requirement
    if (config.skipRequiresQueue) {
      const queue = await this.context.api.getQueue(this.context.roomId)
      const queueLength = queue?.length ?? 0
      if (queueLength <= config.skipRequiresQueueMin) {
        console.log(
          `[${this.name}] Queue has ${queueLength} tracks (minimum required: ${config.skipRequiresQueueMin + 1}), not skipping`,
        )
        return
      }
    }

    console.log(
      `[${this.name}] DJ ${addedByUsername} is absent, starting countdown for track: ${track.title}`,
    )

    // Send messageOnPlay if configured
    if (config.messageOnPlay) {
      const message = this.interpolateMessage(config.messageOnPlay, addedByUsername, track.title)
      await this.context.api.sendSystemMessage(this.context.roomId, message, {
        type: "alert",
        status: "warning",
      })
    }

    // Start the countdown timer
    this.startTimer(track, addedByUserId, addedByUsername, config)
  }

  private async onUserJoined(data: { roomId: string; user: User }): Promise<void> {
    if (!this.context || !this.activeTimer) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    // Check if the joining user is the absent DJ we're waiting for
    if (data.user.userId === this.activeTimer.absentUserId) {
      console.log(
        `[${this.name}] DJ ${this.activeTimer.absentUsername} returned! Cancelling skip countdown`,
      )

      this.clearTimer()

      // Emit event to hide countdown on frontend
      await this.emit("COUNTDOWN_CANCELLED", {
        showCountdown: false,
        countdownStartTime: null,
        absentUsername: null,
      })
    }
  }

  private async onRoomDeleted(): Promise<void> {
    console.log(`[${this.name}] Room deleted, cleaning up`)
    await this.cleanup()
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

    const config = data.config as AbsentDjConfig
    const previousConfig = data.previousConfig as AbsentDjConfig | null
    const wasEnabled = previousConfig?.enabled === true
    const isEnabled = config?.enabled === true

    console.log(`[${this.name}] Config changed:`, { wasEnabled, isEnabled })

    if (!wasEnabled && isEnabled) {
      await this.onPluginEnabled(config)
    } else if (wasEnabled && !isEnabled) {
      await this.onPluginDisabled()
    }
  }

  private async onPluginEnabled(config: AbsentDjConfig): Promise<void> {
    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `👻 Absent DJ enabled: Tracks will be skipped after ${Math.floor(config.skipDelay / 1000)} seconds if the person that added the track is not in the room`,
      { type: "alert", status: "info" },
    )

    // Check if current track's DJ is absent
    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    if (!nowPlaying?.addedBy?.userId) return

    const users = await this.context!.api.getUsers(this.context!.roomId)
    const isPresent = users.some((u) => u.userId === nowPlaying.addedBy!.userId)

    if (!isPresent) {
      // Check queue length requirement
      if (config.skipRequiresQueue) {
        const queue = await this.context!.api.getQueue(this.context!.roomId)
        const queueLength = queue?.length ?? 0
        if (queueLength <= config.skipRequiresQueueMin) {
          console.log(
            `[${this.name}] Queue has ${queueLength} tracks (minimum required: ${config.skipRequiresQueueMin + 1}), not starting countdown`,
          )
          return
        }
      }

      const addedByUsername = nowPlaying.addedBy.username ?? "Unknown DJ"
      console.log(
        `[${this.name}] Current track DJ ${addedByUsername} is absent, starting countdown`,
      )

      // Send messageOnPlay if configured
      if (config.messageOnPlay) {
        const message = this.interpolateMessage(
          config.messageOnPlay,
          addedByUsername,
          nowPlaying.title,
        )
        await this.context!.api.sendSystemMessage(this.context!.roomId, message, {
          type: "alert",
          status: "warning",
        })
      }

      this.startTimer(nowPlaying, nowPlaying.addedBy.userId, addedByUsername, config)
    }
  }

  private async onPluginDisabled(): Promise<void> {
    this.clearTimer()
    await this.emit("PLUGIN_DISABLED", {
      showCountdown: false,
      countdownStartTime: null,
      absentUsername: null,
    })
    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `👻 Absent DJ disabled`,
      { type: "alert", status: "info" },
    )
  }

  // ============================================================================
  // Timer Management
  // ============================================================================

  private startTimer(
    track: QueueItem,
    absentUserId: string,
    absentUsername: string,
    config: AbsentDjConfig,
  ): void {
    this.clearTimer()

    const trackId = track.mediaSource.trackId
    const startTime = Date.now()

    const timeout = setTimeout(async () => {
      await this.skipTrack(trackId, track.title, absentUsername, config)
      this.activeTimer = null
    }, config.skipDelay)

    this.activeTimer = {
      timeout,
      trackId,
      absentUserId,
      absentUsername,
      trackTitle: track.title,
      startTime,
    }

    // Emit event to show countdown on frontend
    this.emit("COUNTDOWN_STARTED", {
      showCountdown: true,
      countdownStartTime: startTime,
      absentUsername,
    })

    console.log(
      `[${this.name}] Started countdown for track ${trackId}, will skip in ${config.skipDelay}ms`,
    )
  }

  private clearTimer(): void {
    if (this.activeTimer) {
      clearTimeout(this.activeTimer.timeout)
      console.log(`[${this.name}] Cleared timer for track ${this.activeTimer.trackId}`)
      this.activeTimer = null
    }
  }

  // ============================================================================
  // Skip Logic
  // ============================================================================

  private async skipTrack(
    trackId: string,
    trackTitle: string,
    absentUsername: string,
    config: AbsentDjConfig,
  ): Promise<void> {
    if (!this.context) return

    // Re-check queue length requirement before skipping (it may have changed during countdown)
    if (config.skipRequiresQueue) {
      const queue = await this.context.api.getQueue(this.context.roomId)
      const queueLength = queue?.length ?? 0
      if (queueLength <= config.skipRequiresQueueMin) {
        console.log(
          `[${this.name}] Queue has ${queueLength} tracks (minimum required: ${config.skipRequiresQueueMin + 1}), cancelling skip`,
        )
        // Reset the UI state
        await this.emit("SKIP_CANCELLED", {
          showCountdown: false,
          countdownStartTime: null,
          absentUsername: null,
          isSkipped: false,
        })
        return
      }
    }

    console.log(`[${this.name}] Skipping track ${trackId} - DJ ${absentUsername} is absent`)

    // Store skip data for export
    const skipData: SkipData = {
      trackId,
      trackTitle,
      timestamp: Date.now(),
      absentUsername,
    }
    await this.context.storage.set(`skipped:${trackId}`, JSON.stringify(skipData))

    // Update the playlist track with plugin data for export
    const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)
    if (nowPlaying) {
      const existingPluginData = nowPlaying.pluginData ?? {}
      await this.context.api.updatePlaylistTrack(this.context.roomId, {
        ...nowPlaying,
        pluginData: { ...existingPluginData, [this.name]: { skipped: true, skipData } },
      })
    }

    // Skip the track
    await this.context.api.skipTrack(this.context.roomId, trackId)

    // Emit event to update frontend
    await this.emit("TRACK_SKIPPED", {
      showCountdown: false,
      countdownStartTime: null,
      absentUsername: null,
      isSkipped: true,
    })

    // Play sound effect if configured
    if (config.soundEffectOnSkip && config.soundEffectOnSkipUrl) {
      await this.context.api.queueSoundEffect({
        url: config.soundEffectOnSkipUrl,
        volume: 0.6,
      })
    }

    // Send messageOnSkip if configured
    if (config.messageOnSkip) {
      const message = this.interpolateMessage(config.messageOnSkip, absentUsername, trackTitle)
      await this.context.api.sendSystemMessage(this.context.roomId, message)
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private interpolateMessage(template: string, username: string, title: string): string {
    return template
      .replace(/\{\{username\}\}/g, username)
      .replace(/\{\{title\}\}/g, title)
  }

  private parseSkipData(dataStr: string | null): SkipData | null {
    if (!dataStr) return null
    try {
      return JSON.parse(dataStr) as SkipData
    } catch {
      return null
    }
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

  // ============================================================================
  // Room Export
  // ============================================================================

  async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
    // Count tracks that were skipped by this plugin
    const skippedTracks = exportData.playlist.filter(
      (item) => item.pluginData?.["absent-dj"]?.skipped,
    )

    const totalSkipped = skippedTracks.length

    // Get unique absent DJs
    const absentDjs = new Set(
      skippedTracks
        .map((item) => item.pluginData?.["absent-dj"]?.skipData?.absentUsername)
        .filter(Boolean),
    )

    return {
      // Data added to export.pluginExports["absent-dj"] for programmatic access
      data: {
        totalSkipped,
        uniqueAbsentDjs: absentDjs.size,
        absentDjNames: Array.from(absentDjs),
      },
      // No separate markdown section - notes are added per-track via formatPluginDataMarkdown
      markdownSections: [],
    }
  }

  formatPluginDataMarkdown(pluginData: unknown, context: PluginMarkdownContext): string | null {
    // Only format for playlist items
    if (context.type !== "playlist") return null

    const data = pluginData as {
      skipped?: boolean
      skipData?: { absentUsername: string }
    }

    if (!data.skipped || !data.skipData) return null

    return `👻 Skipped (DJ ${data.skipData.absentUsername} absent)`
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory function to create the plugin.
 * A new instance is created for each room.
 */
export function createAbsentDjPlugin(configOverrides?: Partial<AbsentDjConfig>): Plugin {
  return new AbsentDjPlugin(configOverrides)
}

export default createAbsentDjPlugin
