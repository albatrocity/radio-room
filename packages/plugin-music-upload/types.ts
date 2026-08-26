import { z } from "zod"

export const PLUGIN_NAME = "music-upload"
export const UPLOADER_PERSONA_ID = "uploader"
export const UPLOADING_USERS_KEY = "uploadingUserIds"

export const musicUploadConfigSchema = z.object({
  enabled: z.boolean().default(true),
  uploadButtonLabel: z.string().default("Upload music"),
})

export type MusicUploadConfig = z.infer<typeof musicUploadConfigSchema>

export const defaultMusicUploadConfig: MusicUploadConfig = {
  enabled: true,
  uploadButtonLabel: "Upload music",
}

export interface MusicUploadComponentState extends Record<string, unknown> {
  uploaderUserIds: string[]
  uploadingUserIds: string[]
}
