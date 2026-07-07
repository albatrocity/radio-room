import type {
  BeforePlayQueuedTrackParams,
  Plugin,
  PluginActionInitiator,
  PluginComponentSchema,
  PluginComponentState,
  PluginConfigSchema,
  PluginContext,
  SystemEventPayload,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import {
  clampVolumePercent,
  defaultVolumeManagerConfig,
  volumeManagerConfigSchema,
  type VolumeManagerConfig,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"

export type { VolumeManagerConfig } from "./types"
export {
  volumeManagerConfigSchema,
  defaultVolumeManagerConfig,
  clampVolumePercent,
} from "./types"

export class VolumeManagerPlugin extends BasePlugin<VolumeManagerConfig> {
  name = "volume-manager"
  version = "1.0.0"
  description = "Control Spotify playback volume with live and per-track-start settings."

  static readonly configSchema = volumeManagerConfigSchema
  static readonly defaultConfig = defaultVolumeManagerConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async getComponentState(): Promise<PluginComponentState> {
    const config = await this.getConfig()
    if (!config?.enabled) {
      return { volume: config?.volume ?? defaultVolumeManagerConfig.volume }
    }

    return { volume: config.volume }
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    this.on("TRACK_CHANGED", this.handleTrackChanged.bind(this))
    this.on("PLAYBACK_VOLUME_CHANGED", this.handlePlaybackVolumeChanged.bind(this))
    this.onConfigChange(this.handleConfigChange.bind(this))
  }

  async beforePlayQueuedTrack(_params: BeforePlayQueuedTrackParams): Promise<void> {
    await this.applyStartVolumeIfEnabled()
  }

  async executeAction(
    action: string,
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string }> {
    if (action === "setVolume") {
      return this.handleSetVolume(initiator, params)
    }

    return { success: false, message: `Unknown action: ${action}` }
  }

  private async handleTrackChanged(
    _data: SystemEventPayload<"TRACK_CHANGED">,
  ): Promise<void> {
    await this.applyStartVolumeIfEnabled()
  }

  private async handlePlaybackVolumeChanged(
    data: SystemEventPayload<"PLAYBACK_VOLUME_CHANGED">,
  ): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled) {
      return
    }

    const volume = clampVolumePercent(data.volumePercent)
    if (config.volume === volume) {
      return
    }

    await this.context!.api.setPluginConfig(this.context!.roomId, this.name, {
      ...config,
      volume,
    })

    await this.emit("VOLUME_CHANGED", { volume })
  }

  private async handleConfigChange(data: {
    roomId: string
    pluginName: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    if (data.pluginName !== this.name) return

    const config = data.config as VolumeManagerConfig
    if (!config.enabled) return

    const previousVolume = data.previousConfig.volume
    const nextVolume = config.volume

    if (typeof nextVolume !== "number" || nextVolume === previousVolume) {
      return
    }

    const applied = await this.applyLiveVolume(nextVolume)
    if (applied) {
      await this.emit("VOLUME_CHANGED", { volume: clampVolumePercent(nextVolume) })
    }
  }

  private async handleSetVolume(
    initiator?: PluginActionInitiator,
    params?: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string }> {
    const adminCheck = await this.requireRoomAdmin(initiator)
    if (!adminCheck.ok) {
      return adminCheck.result
    }

    const config = await this.getConfig()
    if (!config?.enabled) {
      return { success: false, message: "Volume Manager is not enabled" }
    }

    const rawVolume = params?.volume
    if (typeof rawVolume !== "number" || !Number.isFinite(rawVolume)) {
      return { success: false, message: "Invalid volume" }
    }

    const volume = clampVolumePercent(rawVolume)
    const result = await this.context!.api.setPlaybackVolume(this.context!.roomId, volume)
    if (!result.success) {
      return result
    }

    await this.context!.api.setPluginConfig(this.context!.roomId, this.name, {
      ...config,
      volume,
    })

    await this.emit("VOLUME_CHANGED", { volume })
    return { success: true }
  }

  private async applyStartVolumeIfEnabled(): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled || !config.setOnTrackStart) {
      return
    }

    const startVolume = clampVolumePercent(config.startVolume)
    const applied = await this.applyLiveVolume(startVolume)
    if (!applied) {
      return
    }

    await this.context!.api.setPluginConfig(this.context!.roomId, this.name, {
      ...config,
      volume: startVolume,
    })

    await this.emit("VOLUME_CHANGED", { volume: startVolume })
  }

  private async applyLiveVolume(volumePercent: number): Promise<boolean> {
    const volume = clampVolumePercent(volumePercent)
    const result = await this.context!.api.setPlaybackVolume(this.context!.roomId, volume)
    if (!result.success) {
      console.warn(`[${this.name}] Failed to set playback volume:`, result.message)
      return false
    }
    return true
  }

  private async requireRoomAdmin(
    initiator?: PluginActionInitiator,
  ): Promise<
    | { ok: true }
    | { ok: false; result: { success: false; message: string } }
  > {
    const userId = initiator?.userId?.trim()
    if (!userId) {
      return { ok: false, result: { success: false, message: "Admin required" } }
    }

    const isAdmin = await this.context!.api.isRoomAdmin(this.context!.roomId, userId)
    if (!isAdmin) {
      return { ok: false, result: { success: false, message: "Admin required" } }
    }

    return { ok: true }
  }
}

export function createVolumeManagerPlugin(
  configOverrides?: Partial<VolumeManagerConfig>,
): Plugin {
  return new VolumeManagerPlugin(configOverrides)
}

export default createVolumeManagerPlugin
