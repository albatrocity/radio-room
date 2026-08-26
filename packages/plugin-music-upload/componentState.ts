import type { MusicUploadComponentState } from "./types"
import { UPLOADING_USERS_KEY } from "./types"

export async function readUploadingUserIds(
  storage: { get: (key: string) => Promise<unknown> },
): Promise<string[]> {
  const raw = await storage.get(UPLOADING_USERS_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter((id): id is string => typeof id === "string")
}

export async function writeUploadingUserIds(
  storage: { set: (key: string, value: unknown) => Promise<void> },
  userIds: string[],
): Promise<void> {
  await storage.set(UPLOADING_USERS_KEY, userIds)
}

export function buildUploadStatusStore(
  uploaderUserIds: string[],
  uploadingUserIds: string[],
): MusicUploadComponentState {
  return {
    uploaderUserIds,
    uploadingUserIds,
  }
}
