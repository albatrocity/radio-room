import type { MusicUploadComponentState } from "./types"
import { UPLOADING_USERS_KEY } from "./types"

export async function readUploadingUserIds(
  storage: { get: (key: string) => Promise<string | null> },
): Promise<string[]> {
  const raw = await storage.get(UPLOADING_USERS_KEY)
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((id): id is string => typeof id === "string")
}

export async function writeUploadingUserIds(
  storage: { set: (key: string, value: string) => Promise<void> },
  userIds: string[],
): Promise<void> {
  await storage.set(UPLOADING_USERS_KEY, JSON.stringify(userIds))
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
