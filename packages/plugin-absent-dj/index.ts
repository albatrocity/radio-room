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
import {
  BasePlugin,
  TrackAnnotations,
  shouldSkipGivenQueue,
} from "@repo/plugin-base"
import { interpolateTemplate } from "@repo/utils"
import packageJson from "./package.json"
import { absentDjConfigSchema, defaultAbsentDjConfig, type AbsentDjConfig } from "./types"
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
// Timer Constants and Types
// ============================================================================

const COUNTDOWN_TIMER_ID = "absent-dj-countdown"
const COUNTDOWN_STATE_KEY = "countdown-state"

/** Persisted countdown state for schedule-based UI (ADR 0190). */
interface CountdownState {
  trackId: string
  absentUserId: string
  absentUsername: string
  trackTitle: string
  startTime: number
  deadline: number
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
  description = "Automatically skip tracks when the DJ who added them is not present in the room."

  static readonly configSchema = absentDjConfigSchema
  static readonly defaultConfig = defaultAbsentDjConfig

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

    // Check for a persisted countdown state
    const stateRaw = await this.context.storage.get(COUNTDOWN_STATE_KEY)
    if (stateRaw) {
      try {
        const state = JSON.parse(stateRaw) as CountdownState
        if (state.deadline > Date.now()) {
          return {
            showCountdown: true,
            countdownStartTime: state.startTime,
            absentUsername: state.absentUsername,
            isSkipped: false,
          }
        }
      } catch { /* stale data, ignore */ }
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

    this.onScheduled("countdown", async (payload) => {
      const data = payload as CountdownState
      await this.skipTrack(data.trackId, data.trackTitle, data.absentUsername, await this.getConfig() as AbsentDjConfig)
    })

    this.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
    this.on("USER_JOINED", this.onUserJoined.bind(this))
    this.on("ROOM_DELETED", this.onRoomDeleted.bind(this))
    this.onConfigChange(this.handleConfigChange.bind(this))
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    if (!this.context) return

    // Clear any existing countdown from previous track
    await this.cancelSchedule(COUNTDOWN_TIMER_ID)
    await this.context.storage.del(COUNTDOWN_STATE_KEY)

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
      if (!shouldSkipGivenQueue(queueLength, config)) {
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
    await this.startCountdownTimer(track, addedByUserId, addedByUsername, config)
  }

  private async onUserJoined(data: { roomId: string; user: User }): Promise<void> {
    if (!this.context) return

    // Check if there's a pending countdown for an absent DJ
    const stateRaw = await this.context.storage.get(COUNTDOWN_STATE_KEY)
    if (!stateRaw) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    let countdownState: CountdownState
    try {
      countdownState = JSON.parse(stateRaw) as CountdownState
    } catch {
      return
    }

    // Check if the joining user is the absent DJ we're waiting for
    if (data.user.userId === countdownState.absentUserId) {
      console.log(
        `[${this.name}] DJ ${countdownState.absentUsername} returned! Cancelling skip countdown`,
      )

      await this.cancelSchedule(COUNTDOWN_TIMER_ID)
      await this.context.storage.del(COUNTDOWN_STATE_KEY)

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
        if (!shouldSkipGivenQueue(queueLength, config)) {
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

      await this.startCountdownTimer(nowPlaying, nowPlaying.addedBy.userId, addedByUsername, config)
    }
  }

  private async onPluginDisabled(): Promise<void> {
    await this.cancelSchedule(COUNTDOWN_TIMER_ID)
    if (this.context) await this.context.storage.del(COUNTDOWN_STATE_KEY)
    await this.emit("PLUGIN_DISABLED", {
      showCountdown: false,
      countdownStartTime: null,
      absentUsername: null,
    })
    await this.context!.api.sendSystemMessage(this.context!.roomId, `👻 Absent DJ disabled`, {
      type: "alert",
      status: "info",
    })
  }

  // ============================================================================
  // Timer Management
  // ============================================================================

  private async startCountdownTimer(
    track: QueueItem,
    absentUserId: string,
    absentUsername: string,
    config: AbsentDjConfig,
  ): Promise<void> {
    if (!this.context) return
    const trackId = track.mediaSource.trackId
    const trackTitle = track.title
    const startTime = Date.now()
    const deadline = startTime + config.skipDelay

    const countdownState: CountdownState = {
      trackId,
      absentUserId,
      absentUsername,
      trackTitle,
      startTime,
      deadline,
    }

    // Persist countdown state for UI hydration
    await this.context.storage.set(COUNTDOWN_STATE_KEY, JSON.stringify(countdownState))

    await this.schedule({
      id: COUNTDOWN_TIMER_ID,
      kind: "countdown",
      durationMs: config.skipDelay,
      payload: countdownState,
    })

    // Emit event to show countdown on frontend
    this.emit("COUNTDOWN_STARTED", {
      showCountdown: true,
      countdownStartTime: startTime,
      absentUsername,
    })
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
      if (!shouldSkipGivenQueue(queueLength, config)) {
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

    // Store skip data for export (before skipTrack so now-playing is still this track)
    const skipData: SkipData = {
      trackId,
      trackTitle,
      timestamp: Date.now(),
      absentUsername,
    }
    await this.trackAnnotations.markSkipped(trackId, skipData)

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
        duck: true,
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

  private get trackAnnotations(): TrackAnnotations {
    return new TrackAnnotations({
      storage: this.context!.storage,
      api: this.context!.api,
      roomId: this.context!.roomId,
      pluginName: this.name,
    })
  }

  private interpolateMessage(template: string, username: string, title: string): string {
    return interpolateTemplate(template, { username, title })
  }

  // ============================================================================
  // Augmentation
  // ============================================================================

  async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
    if (!this.context) return {}

    const config = await this.getConfig()
    if (!config?.enabled) return {}

    const [data] = await this.trackAnnotations.enrichQueueItems([item])
    if (!data.skipped) return {}

    return {
      ...data,
      styles: { title: { textDecoration: "line-through", opacity: 0.7 } },
    }
  }

  async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
    if (!this.context || items.length === 0) {
      return items.map(() => ({}))
    }

    return this.trackAnnotations.enrichQueueItems(items)
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
