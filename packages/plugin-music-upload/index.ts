import type {
  Plugin,
  PluginComponentSchema,
  PluginComponentState,
  PluginConfigSchema,
  PluginContext,
} from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import packageJson from "./package.json"
import {
  defaultMusicUploadConfig,
  musicUploadConfigSchema,
  PLUGIN_NAME,
  UPLOADER_PERSONA_ID,
  type MusicUploadConfig,
} from "./types"
import { getComponentSchema, getConfigSchema } from "./schema"
import {
  buildUploadStatusStore,
  readUploadingUserIds,
  writeUploadingUserIds,
} from "./componentState"

export type { MusicUploadConfig } from "./types"
export { musicUploadConfigSchema, defaultMusicUploadConfig, PLUGIN_NAME, UPLOADER_PERSONA_ID } from "./types"

const FULL_UPLOADER_PERSONA_ID = `plugin:${PLUGIN_NAME}:${UPLOADER_PERSONA_ID}`

/**
 * Music Upload Plugin
 *
 * Admins designate uploaders via persona; designated users upload audio/archives
 * to private S3 via presigned PUT (core REST routes).
 */
export class MusicUploadPlugin extends BasePlugin<MusicUploadConfig> {
  name = PLUGIN_NAME
  version = packageJson.version
  description = "Designate uploaders and send private music/archive files to object storage."

  static readonly configSchema = musicUploadConfigSchema as any
  static readonly defaultConfig = defaultMusicUploadConfig

  getConfigSchema(): PluginConfigSchema {
    return getConfigSchema()
  }

  getComponentSchema(): PluginComponentSchema {
    return getComponentSchema()
  }

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    await this.personas.registerPersonas([
      {
        id: UPLOADER_PERSONA_ID,
        label: "Uploader",
        icon: "Upload",
        exclusive: false,
        assignableByAdmin: true,
        decoratesUser: true,
        decoratesChatMessage: false,
      },
    ])

    this.on("PERSONA_ASSIGNED", this.onPersonaChanged.bind(this))
    this.on("PERSONA_REMOVED", this.onPersonaChanged.bind(this))
    this.on("MUSIC_UPLOAD_STARTED", this.onUploadStarted.bind(this))
    this.on("MUSIC_UPLOAD_COMPLETED", this.onUploadFinished.bind(this))
    this.on("MUSIC_UPLOAD_FAILED", this.onUploadFinished.bind(this))

    const config = await this.getConfig()
    if (config?.enabled) {
      await this.publishUploadStatus()
    }
  }

  async getComponentState(): Promise<PluginComponentState> {
    if (!this.context) return {}
    const config = await this.getConfig()
    if (!config?.enabled) {
      return buildUploadStatusStore([], [])
    }
    const uploaderUserIds = await this.personas.getUsersWithPersona(UPLOADER_PERSONA_ID)
    const uploadingUserIds = await readUploadingUserIds(this.context.storage)
    return buildUploadStatusStore(uploaderUserIds, uploadingUserIds)
  }

  private async onPersonaChanged(data: {
    roomId: string
    personaId: string
  }): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    if (data.personaId !== FULL_UPLOADER_PERSONA_ID && data.personaId !== UPLOADER_PERSONA_ID) {
      return
    }
    const config = await this.getConfig()
    if (!config?.enabled) return
    await this.publishUploadStatus()
  }

  private async onUploadStarted(data: { roomId: string; userId: string }): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    const uploading = await readUploadingUserIds(this.context.storage)
    if (!uploading.includes(data.userId)) {
      await writeUploadingUserIds(this.context.storage, [...uploading, data.userId])
    }
    await this.publishUploadStatus()
  }

  private async onUploadFinished(data: { roomId: string; userId: string }): Promise<void> {
    if (!this.context || data.roomId !== this.context.roomId) return
    const uploading = await readUploadingUserIds(this.context.storage)
    const next = uploading.filter((id) => id !== data.userId)
    if (next.length !== uploading.length) {
      await writeUploadingUserIds(this.context.storage, next)
    }
    await this.publishUploadStatus()
  }

  private async publishUploadStatus(): Promise<void> {
    const state = await this.getComponentState()
    await this.emit("UPLOAD_STATUS", state)
  }

  async cleanup(): Promise<void> {
    await this.personas.unregisterPersonas()
    await super.cleanup()
  }
}

export default function createMusicUploadPlugin(
  overrides?: Partial<MusicUploadConfig>,
): Plugin<MusicUploadConfig> {
  return new MusicUploadPlugin(overrides)
}
