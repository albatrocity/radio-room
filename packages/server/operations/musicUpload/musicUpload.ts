import type { AppContext } from "@repo/types"
import { getUser } from "../data/users"
import { findRoom } from "../data/rooms"
import { pluginPersonaId } from "../../services/PersonaService"
import type { PersonaService } from "../../services/PersonaService"
import {
  createMusicUploadPresign,
  completeMusicUploadSession,
  failMusicUploadSession,
  MusicUploadBadRequestError,
  MusicUploadForbiddenError,
  MusicUploadNotFoundError,
} from "../../services/MusicUploadService"
import { getMergedPluginConfig } from "../data/pluginConfigs"

const PLUGIN_NAME = "music-upload"
const UPLOADER_PERSONA_ID = pluginPersonaId(PLUGIN_NAME, "uploader")

async function requireUploader({
  context,
  roomId,
  userId,
}: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<void> {
  const config = await getMergedPluginConfig({ context, roomId, pluginName: PLUGIN_NAME })
  // Match plugin defaultConfig / schema default (enabled: true) when nothing is stored yet.
  if (config?.enabled === false) {
    throw new MusicUploadForbiddenError("Music upload is not enabled in this room")
  }

  const personaSvc = context.personas as PersonaService | undefined
  if (!personaSvc) {
    throw new MusicUploadForbiddenError("Persona service unavailable")
  }

  const hasPersona =
    (await personaSvc.userHasPersona(roomId, userId, UPLOADER_PERSONA_ID)) ||
    (await personaSvc.userHasPersona(roomId, userId, "uploader"))
  if (!hasPersona) {
    throw new MusicUploadForbiddenError("Uploader designation required")
  }
}

export async function presignMusicUpload({
  context,
  roomId,
  userId,
  body,
}: {
  context: AppContext
  roomId: string
  userId: string
  body: {
    filename?: string
    contentType?: string
    contentLength?: number
  }
}) {
  const room = await findRoom({ context, roomId })
  if (!room) {
    throw new MusicUploadNotFoundError("Room not found")
  }

  await requireUploader({ context, roomId, userId })

  const user = await getUser({ context, userId })
  const result = await createMusicUploadPresign(context.redis, {
    roomId,
    userId,
    username: user?.username,
    filename: body.filename ?? "",
    contentType: body.contentType ?? "",
    contentLength: Number(body.contentLength),
  })

  await context.systemEvents?.emit(roomId, "MUSIC_UPLOAD_STARTED", {
    roomId,
    userId,
    uploadId: result.uploadId,
    key: result.key,
  })

  return result
}

export async function completeMusicUpload({
  context,
  roomId,
  userId,
  body,
}: {
  context: AppContext
  roomId: string
  userId: string
  body: { uploadId?: string; key?: string }
}) {
  const session = await completeMusicUploadSession(context.redis, roomId, userId, {
    uploadId: body.uploadId ?? "",
    key: body.key ?? "",
  })

  await context.systemEvents?.emit(roomId, "MUSIC_UPLOAD_COMPLETED", {
    roomId,
    userId: session.userId,
    uploadId: session.uploadId,
    key: session.key,
  })

  return { ok: true as const }
}

export async function failMusicUpload({
  context,
  roomId,
  userId,
  body,
}: {
  context: AppContext
  roomId: string
  userId: string
  body: { uploadId?: string; key?: string; reason?: string }
}) {
  const session = await failMusicUploadSession(context.redis, roomId, userId, {
    uploadId: body.uploadId ?? "",
    key: body.key ?? "",
  })

  await context.systemEvents?.emit(roomId, "MUSIC_UPLOAD_FAILED", {
    roomId,
    userId: session.userId,
    uploadId: session.uploadId,
    key: session.key,
    reason: body.reason,
  })

  return { ok: true as const }
}

export {
  MusicUploadBadRequestError,
  MusicUploadForbiddenError,
  MusicUploadNotFoundError,
} from "../../services/MusicUploadService"
