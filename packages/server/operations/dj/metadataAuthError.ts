import type { AppContext } from "@repo/types"
import { isMetadataSourceAuthFailure } from "@repo/utils"

/**
 * Publish a sticky metadata-source auth error for the room creator when the
 * failure looks like an expired/revoked token (ADR 0088 / search UX).
 */
export async function publishMetadataAuthError(params: {
  context: AppContext
  roomId: string
  creatorUserId: string
  error: unknown
  source?: string
}): Promise<void> {
  const { context, roomId, creatorUserId, error, source } = params
  if (!isMetadataSourceAuthFailure(error)) return
  const message =
    error instanceof Error ? error.message : String(error ?? "Authentication failed")
  const { pubMetadataSourceError } = await import("../room/handleRoomNowPlayingData")
  await pubMetadataSourceError({
    context,
    userId: creatorUserId,
    roomId,
    error: {
      status: 401,
      message,
      reason: source,
    },
  })
}
