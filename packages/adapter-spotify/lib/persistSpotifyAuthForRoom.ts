import type { AppContext } from "@repo/types"
import {
  storeUserServiceAuth,
  type ServiceAuthTokens,
} from "@repo/server/operations/data/serviceAuthentications"
import {
  emitRoomSettingsUpdated,
  findRoom,
  removeUserRoomsSpotifyError,
} from "@repo/server/operations/data/rooms"

/**
 * Persist Spotify OAuth tokens for the linking user and, when linking from a
 * room, also for `room.creator` so playback/token provision (ADR 0012 / 0078)
 * can refresh. Clears the room's sticky `spotifyError` banner.
 */
export async function persistSpotifyAuthForRoom(params: {
  context: AppContext
  linkingUserId: string
  roomId?: string | null
  tokens: ServiceAuthTokens
}): Promise<void> {
  const { context, linkingUserId, roomId, tokens } = params

  await storeUserServiceAuth({
    context,
    userId: linkingUserId,
    serviceName: "spotify",
    tokens,
  })

  const userIdsToClear = new Set<string>([linkingUserId])

  if (roomId) {
    try {
      const room = await findRoom({ context, roomId })
      if (room?.creator && room.creator !== linkingUserId) {
        await storeUserServiceAuth({
          context,
          userId: room.creator,
          serviceName: "spotify",
          tokens,
        })
        userIdsToClear.add(room.creator)
      }
      await context.redis.pubClient.hDel(`room:${roomId}:details`, "spotifyError")
      await emitRoomSettingsUpdated({ context, roomId })
    } catch (e) {
      console.warn("[Spotify Auth] Failed to associate Spotify auth with room:", e)
    }
  }

  for (const userId of userIdsToClear) {
    try {
      await removeUserRoomsSpotifyError({ context, userId })
    } catch (e) {
      console.warn("[Spotify Auth] Failed to clear room spotifyError:", e)
    }
  }
}
