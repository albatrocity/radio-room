import type {
  Plugin,
  PluginContext,
  PluginConfigSchema,
  PluginComponentSchema,
  PluginComponentState,
  PluginActionInitiator,
  QueueItem,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import {
  queuePacerConfigSchema,
  defaultQueuePacerConfig,
  defaultQueuePacerState,
  isActive,
  type QueuePacerConfig,
  type QueuePacerState,
} from "./types"
import { getConfigSchema, getComponentSchema } from "./schema"

export type { QueuePacerConfig, QueuePacerState } from "./types"
export { queuePacerConfigSchema, defaultQueuePacerConfig, defaultQueuePacerState, isActive } from "./types"

const STATE_KEY = "state"
const LEGACY_PLUGIN_NAME = "time-cop"
const MIN_TIMER_MS = 5_000

function formatTime(epochMs: number, timeZone?: string | null): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  })
}

function trackExceedsBudget(
  nowPlaying: QueueItem | null,
  perTrackWindowMs: number | null,
): boolean {
  if (perTrackWindowMs == null || !nowPlaying) return false
  const trackDuration = nowPlaying.track?.duration ?? 0
  return trackDuration > perTrackWindowMs
}

function computeSkipAmountMs(
  nowPlaying: QueueItem | null,
  perTrackWindowMs: number | null,
): number {
  if (perTrackWindowMs == null || !nowPlaying) return 0
  const trackDuration = nowPlaying.track?.duration ?? 0
  if (trackDuration <= perTrackWindowMs) return 0
  return trackDuration - perTrackWindowMs
}

export class QueuePacerPlugin extends BasePlugin<QueuePacerConfig> {
  name = "queue-pacer"
  version = "1.0.0"
  description = "Finish the queue by a target end time with dynamic per-track playback windows."

  static readonly configSchema = queuePacerConfigSchema
  static readonly defaultConfig = defaultQueuePacerConfig

  private state: QueuePacerState = { ...defaultQueuePacerState }

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async getComponentState(): Promise<PluginComponentState> {
    const config = await this.getConfig()
    console.log(`[${this.name}] getComponentState called`, {
      roomId: this.context?.roomId,
      configEnabled: config?.enabled,
      configEndTime: config?.endTime,
      isActiveResult: isActive(config),
    })

    if (!isActive(config)) {
      return {
        enabled: false,
        isPaused: false,
        currentTrackSkipCanceled: false,
        trackStartTime: null,
        perTrackWindowMs: null,
        pausedRemainingMs: null,
        trackExceedsBudget: false,
        skipAmountMs: 0,
        hasQueuedTracksBehind: false,
      }
    }

    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    const queue = await this.context!.api.getQueue(this.context!.roomId)
    const hasQueuedTracksBehind = queue.length > 0
    const perTrackWindowMs = await this.computeWindow(config!)
    const exceedsBudget = trackExceedsBudget(nowPlaying, perTrackWindowMs)
    const skipAmountMs = computeSkipAmountMs(nowPlaying, perTrackWindowMs)

    console.log(`[${this.name}] getComponentState active`, {
      hasNowPlaying: !!nowPlaying,
      nowPlayingMediaTrackId: nowPlaying?.mediaSource?.trackId,
      nowPlayingPlayedAt: nowPlaying?.playedAt,
      perTrackWindowMs,
      trackExceedsBudget: exceedsBudget,
      skipAmountMs,
      hasQueuedTracksBehind,
    })

    return {
      enabled: config!.enabled,
      isPaused: this.state.isPaused,
      currentTrackSkipCanceled: this.state.currentTrackSkipCanceled,
      trackStartTime: nowPlaying?.playedAt ?? null,
      perTrackWindowMs,
      pausedRemainingMs: this.state.pausedRemainingMs,
      trackExceedsBudget: exceedsBudget,
      skipAmountMs,
      hasQueuedTracksBehind,
    }
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.on("TRACK_CHANGED", this.handleTrackChanged.bind(this))
    this.on("QUEUE_CHANGED", this.handleQueueChanged.bind(this))
    this.on("PLAYBACK_STATE_CHANGED", this.handlePlaybackStateChanged.bind(this))
    this.on("ROOM_SETTINGS_UPDATED", this.handleRoomSettingsUpdated.bind(this))
    this.onConfigChange(this.handleConfigChange.bind(this))

    await this.migrateFromLegacyPlugin()
    await this.rehydrateState()

    const config = await this.getConfig()
    console.log(`[${this.name}] Registered for room ${context.roomId}`, {
      configExists: !!config,
      enabled: config?.enabled,
      endTime: config?.endTime,
      isActive: isActive(config),
    })
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (action === "cancelCurrentTrackSkip") {
      return this.cancelCurrentTrackSkip(initiator)
    }
    return { success: false, message: "Unknown action" }
  }

  private async migrateFromLegacyPlugin(): Promise<void> {
    const current = await this.getConfig()
    if (current != null) return

    const legacy = await this.context!.api.getPluginConfig(
      this.context!.roomId,
      LEGACY_PLUGIN_NAME,
    )
    if (legacy) {
      await this.context!.api.setPluginConfig(this.context!.roomId, this.name, legacy)
    }
  }

  private async rehydrateState(): Promise<void> {
    const storedState = await this.context!.storage.get(STATE_KEY)
    if (storedState) {
      try {
        this.state = { ...defaultQueuePacerState, ...JSON.parse(storedState) }
      } catch {
        this.state = { ...defaultQueuePacerState }
      }
    }

    const config = await this.getConfig()
    if (isActive(config) && this.state.currentTrackId) {
      await this.armCurrentTrack()
    }
  }

  private async persistState(): Promise<void> {
    await this.context!.storage.set(STATE_KEY, JSON.stringify(this.state))
  }

  private async computeWindow(config: QueuePacerConfig): Promise<number | null> {
    if (!config.endTime) return null

    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    const queue = await this.context!.api.getQueue(this.context!.roomId)
    const remainingTracks = queue.length + (nowPlaying ? 1 : 0)

    if (remainingTracks === 0) return null

    const timeRemaining = config.endTime - Date.now()
    const naive = timeRemaining / remainingTracks

    if (naive < config.minPlaybackMs) {
      if (config.warnOnOverrun && !this.state.isPaused) {
        const overrunMs = (config.minPlaybackMs - naive) * remainingTracks
        await this.context!.api.sendSystemMessage(
          this.context!.roomId,
          `⏰ Queue Pacer: Queue will overrun end time by ~${Math.ceil(overrunMs / 60_000)} minute(s) at minimum playback.`,
          { type: "alert", status: "warning" },
        )
      }
      return config.minPlaybackMs
    }

    return Math.floor(naive)
  }

  private async armCurrentTrack(): Promise<void> {
    const config = await this.getConfig()
    console.log(`[${this.name}] armCurrentTrack called`, {
      roomId: this.context?.roomId,
      isActive: isActive(config),
      skipCanceled: this.state.currentTrackSkipCanceled,
    })

    if (!isActive(config)) {
      console.log(`[${this.name}] armCurrentTrack: not active, returning`)
      return
    }
    if (this.state.currentTrackSkipCanceled) {
      console.log(`[${this.name}] armCurrentTrack: skip canceled, returning`)
      return
    }

    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    if (!nowPlaying) {
      console.log(`[${this.name}] armCurrentTrack: no nowPlaying, returning`)
      return
    }

    const perTrackWindowMs = await this.computeWindow(config!)
    if (perTrackWindowMs == null) {
      console.log(`[${this.name}] armCurrentTrack: perTrackWindowMs is null, returning`)
      return
    }

    const trackId = nowPlaying.mediaSource.trackId
    console.log(`[${this.name}] armCurrentTrack: arming track`, {
      trackId,
      metadataTrackId: nowPlaying.track.id,
      playedAt: nowPlaying.playedAt,
      perTrackWindowMs,
    })
    const playedAt = nowPlaying.playedAt ?? Date.now()
    let deadline = playedAt + perTrackWindowMs

    const now = Date.now()
    if (deadline < now + MIN_TIMER_MS) {
      deadline = now + MIN_TIMER_MS
    }

    this.clearTimer(`track:${this.state.currentTrackId}`)
    this.state.currentTrackId = trackId
    this.state.currentDeadline = deadline

    if (this.state.isPaused) {
      this.state.pausedRemainingMs = deadline - now
    } else {
      this.state.pausedRemainingMs = null
      const duration = deadline - now
      this.startTimer(`track:${trackId}`, {
        duration,
        callback: () => this.handleTimerFire(trackId),
      })
    }

    await this.persistState()

    const queue = await this.context!.api.getQueue(this.context!.roomId)
    const hasQueuedTracksBehind = queue.length > 0

    await this.context!.api.emit("WINDOW_RECOMPUTED", {
      trackStartTime: playedAt,
      perTrackWindowMs,
      remainingTracks: queue.length + 1,
      currentTrackId: trackId,
      isPaused: this.state.isPaused,
      pausedRemainingMs: this.state.pausedRemainingMs,
      currentTrackSkipCanceled: this.state.currentTrackSkipCanceled,
      trackExceedsBudget: trackExceedsBudget(nowPlaying, perTrackWindowMs),
      skipAmountMs: computeSkipAmountMs(nowPlaying, perTrackWindowMs),
      hasQueuedTracksBehind,
    })
  }

  private async handleTimerFire(trackId: string): Promise<void> {
    console.log(`[${this.name}] handleTimerFire called`, {
      trackId,
      roomId: this.context?.roomId,
      stateCurrentTrackId: this.state.currentTrackId,
      isPaused: this.state.isPaused,
    })

    const config = await this.getConfig()
    if (!isActive(config)) {
      console.log(`[${this.name}] handleTimerFire: not active, returning`)
      return
    }

    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    const nowPlayingMediaTrackId = nowPlaying?.mediaSource?.trackId
    console.log(`[${this.name}] handleTimerFire: nowPlaying check`, {
      hasNowPlaying: !!nowPlaying,
      nowPlayingMediaTrackId,
      timerTrackId: trackId,
      matchesTimerTrackId: nowPlayingMediaTrackId === trackId,
    })

    if (!nowPlaying || nowPlayingMediaTrackId !== trackId) {
      console.log(`[${this.name}] Stale timer fire for track ${trackId}, ignoring`)
      return
    }

    if (this.state.isPaused) {
      console.log(`[${this.name}] Timer fired while paused, ignoring`)
      return
    }

    const queue = await this.context!.api.getQueue(this.context!.roomId)
    console.log(`[${this.name}] handleTimerFire: queue check`, {
      queueLength: queue.length,
    })

    if (queue.length === 0) {
      console.log(`[${this.name}] Last track, letting it finish`)
      await this.context!.api.emit("LET_IT_FINISH", {
        trackId,
        reason: "last_track",
      })
      return
    }

    console.log(`[${this.name}] Skipping track ${trackId}`)
    try {
      await this.context!.api.skipTrack(this.context!.roomId, trackId)
      console.log(`[${this.name}] skipTrack call completed`)
    } catch (err) {
      console.error(`[${this.name}] skipTrack error:`, err)
    }

    await this.context!.api.emit("TRACK_SKIPPED", {
      trackId,
      deadline: this.state.currentDeadline,
      skippedAt: Date.now(),
    })
  }

  private async handleTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    if (data.roomId !== this.context!.roomId) return

    const config = await this.getConfig()
    if (!isActive(config)) return

    this.state.currentTrackSkipCanceled = false
    this.state.isPaused = false
    this.state.pausedRemainingMs = null
    this.state.currentTrackId = data.track.mediaSource.trackId
    this.state.currentDeadline = null

    await this.persistState()
    await this.armCurrentTrack()
  }

  private async handleQueueChanged(data: { roomId: string; queue: QueueItem[] }): Promise<void> {
    if (data.roomId !== this.context!.roomId) return

    const config = await this.getConfig()
    if (!isActive(config)) return

    await this.armCurrentTrack()
  }

  private async handlePlaybackStateChanged(data: {
    roomId: string
    state: "playing" | "paused" | "stopped"
    trackId: string | null
  }): Promise<void> {
    if (data.roomId !== this.context!.roomId) return

    const config = await this.getConfig()
    if (!isActive(config)) return
    if (!this.state.currentTrackId) return

    const now = Date.now()

    if (data.state === "paused" || data.state === "stopped") {
      if (!this.state.isPaused && this.state.currentDeadline) {
        this.state.pausedRemainingMs = Math.max(0, this.state.currentDeadline - now)
        this.clearTimer(`track:${this.state.currentTrackId}`)
        this.state.isPaused = true

        await this.persistState()

        await this.context!.api.emit("PAUSED", {
          isPaused: true,
          pausedRemainingMs: this.state.pausedRemainingMs,
          currentTrackId: this.state.currentTrackId,
        })
      }
    } else if (data.state === "playing") {
      if (this.state.isPaused && this.state.pausedRemainingMs != null) {
        const newDeadline = now + this.state.pausedRemainingMs
        this.state.currentDeadline = newDeadline
        this.state.isPaused = false

        this.startTimer(`track:${this.state.currentTrackId}`, {
          duration: this.state.pausedRemainingMs,
          callback: () => this.handleTimerFire(this.state.currentTrackId!),
        })

        const trackStartTime = newDeadline - (this.state.pausedRemainingMs || 0)
        this.state.pausedRemainingMs = null

        await this.persistState()

        await this.context!.api.emit("RESUMED", {
          isPaused: false,
          trackStartTime,
          perTrackWindowMs: newDeadline - trackStartTime,
          currentTrackId: this.state.currentTrackId,
        })
      }
    }
  }

  private async handleRoomSettingsUpdated(data: {
    roomId: string
    room: { fetchMeta?: boolean }
  }): Promise<void> {
    if (data.roomId !== this.context!.roomId) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    if (data.room.fetchMeta === false) {
      console.log(`[${this.name}] fetchMeta turned off, disabling Queue Pacer`)

      await this.context!.api.sendSystemMessage(
        this.context!.roomId,
        "⏰ Queue Pacer disabled because Track Detection was turned off.",
        { type: "alert", status: "warning" },
      )

      await this.context!.api.setPluginConfig(this.context!.roomId, this.name, {
        ...config,
        enabled: false,
      })
    }
  }

  private async handleConfigChange(data: {
    roomId: string
    pluginName: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    if (!this.context) return

    const config = data.config as QueuePacerConfig
    const previousConfig = data.previousConfig as QueuePacerConfig | null
    const wasActive = isActive(previousConfig)
    const isNowActive = isActive(config)

    console.log(`[${this.name}] handleConfigChange`, {
      roomId: data.roomId,
      wasActive,
      isNowActive,
      enabled: config.enabled,
      endTime: config.endTime,
      prevEnabled: previousConfig?.enabled,
      prevEndTime: previousConfig?.endTime,
    })

    if (!wasActive && isNowActive) {
      await this.onActivation(config)
    } else if (wasActive && !isNowActive) {
      await this.onDeactivation()
    } else if (wasActive && isNowActive) {
      const settingsChanged =
        config.minPlaybackMs !== previousConfig?.minPlaybackMs ||
        config.endTime !== previousConfig?.endTime

      if (settingsChanged) {
        await this.armCurrentTrack()
      }
    }
  }

  private async onActivation(config: QueuePacerConfig): Promise<void> {
    console.log(`[${this.name}] onActivation called`, {
      roomId: this.context!.roomId,
      enabled: config.enabled,
      endTime: config.endTime,
    })

    const room = await this.context!.getRoom()
    console.log(`[${this.name}] onActivation: room fetchMeta=${room?.fetchMeta}`)
    if (room && !room.fetchMeta) {
      console.log(`[${this.name}] Cannot activate: fetchMeta is off`)
      await this.context!.api.sendSystemMessage(
        this.context!.roomId,
        "⏰ Queue Pacer cannot be enabled while Track Detection is off.",
        { type: "alert", status: "error" },
      )

      await this.context!.api.setPluginConfig(this.context!.roomId, this.name, {
        ...config,
        enabled: false,
      })
      return
    }

    const queue = await this.context!.api.getQueue(this.context!.roomId)
    const nowPlaying = await this.context!.api.getNowPlaying(this.context!.roomId)
    const remainingTracks = queue.length + (nowPlaying ? 1 : 0)
    const perTrackWindowMs = await this.computeWindow(config)

    await this.context!.api.sendSystemMessage(
      this.context!.roomId,
      `⏰ Queue Pacer activated. Targeting ${formatTime(config.endTime!, config.endTimeZone)}. ${remainingTracks} track(s) remaining.`,
      { type: "alert", status: "info" },
    )

    await this.context!.api.emit("ACTIVATED", {
      endTime: config.endTime,
      remainingTracks,
      perTrackWindowMs,
    })

    await this.armCurrentTrack()
  }

  private async onDeactivation(): Promise<void> {
    console.log(`[${this.name}] Deactivated for room ${this.context!.roomId}`)

    this.clearAllTimers()
    this.state = { ...defaultQueuePacerState }
    await this.persistState()

    await this.context!.api.sendSystemMessage(this.context!.roomId, "⏰ Queue Pacer deactivated.", {
      type: "alert",
      status: "info",
    })

    await this.context!.api.emit("DEACTIVATED", {})
  }

  private async cancelCurrentTrackSkip(
    initiator?: PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    if (!initiator?.userId) {
      return { success: false, message: "No initiator provided" }
    }

    const users = await this.context!.api.getUsers(this.context!.roomId)
    const user = users.find((u) => u.userId === initiator.userId)

    if (!user?.isAdmin) {
      return { success: false, message: "Only admins can cancel track skips" }
    }

    const config = await this.getConfig()
    if (!isActive(config)) {
      return { success: false, message: "Queue Pacer is not active" }
    }

    if (!this.state.currentTrackId) {
      return { success: false, message: "No track is currently being timed" }
    }

    this.clearTimer(`track:${this.state.currentTrackId}`)
    this.state.currentTrackSkipCanceled = true
    await this.persistState()

    await this.context!.api.emit("SKIP_CANCELED", {
      trackId: this.state.currentTrackId,
      by: initiator.userId,
      currentTrackSkipCanceled: true,
    })

    return { success: true, message: "Track saved - it will play to completion" }
  }
}

export function createQueuePacerPlugin(configOverrides?: Partial<QueuePacerConfig>): Plugin {
  return new QueuePacerPlugin(configOverrides)
}

export default createQueuePacerPlugin
