import type { AppContext } from "@repo/types"

/** Persisted when Media Bridge links — used as cover pointer libraryId (ADR 0186). */
export function bridgeDaemonIdKey(roomId: string) {
  return `bridge:${roomId}:daemonId`
}

export async function setBridgeDaemonId(params: {
  context: AppContext
  roomId: string
  daemonId: string
}): Promise<void> {
  try {
    await params.context.redis.pubClient.set(
      bridgeDaemonIdKey(params.roomId),
      params.daemonId,
    )
  } catch (e) {
    console.error("[setBridgeDaemonId]", params.roomId, e)
  }
}

export async function getBridgeDaemonId(params: {
  context: AppContext
  roomId: string
}): Promise<string | null> {
  try {
    const value = await params.context.redis.pubClient.get(bridgeDaemonIdKey(params.roomId))
    return value?.trim() || null
  } catch (e) {
    console.error("[getBridgeDaemonId]", params.roomId, e)
    return null
  }
}

/**
 * Library scope for media pointers. Prefer linked daemonId; fall back to roomId
 * (no cross-room reuse, still keeps bytes out of Redis).
 */
export async function resolveMediaLibraryId(params: {
  context: AppContext
  roomId: string
}): Promise<string> {
  const daemonId = await getBridgeDaemonId(params)
  return daemonId ?? `room:${params.roomId}`
}
