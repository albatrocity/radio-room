import { AppContext } from "@repo/types"
import { getUserServiceAuth, storeUserServiceAuth } from "./data/serviceAuthentications"

/**
 * Ensure the room creator (platform user id) has Spotify tokens available.
 *
 * Tokens are keyed by Listening Room user id. After ADR 0071, creator is the
 * Better Auth platform user id. If the admin already linked Spotify under that
 * id (e.g. a previous room), reuse it. If not, copy from the Express session
 * user id when that identity already has Spotify tokens (legacy OAuth session).
 *
 * Never throws — returns false when no tokens can be associated.
 */
export async function ensureCreatorSpotifyAuth({
  context,
  creatorUserId,
  sessionUserId,
}: {
  context: AppContext
  creatorUserId: string
  sessionUserId?: string | null
}): Promise<boolean> {
  try {
    const existing = await getUserServiceAuth({
      context,
      userId: creatorUserId,
      serviceName: "spotify",
    })
    if (existing?.accessToken) {
      return true
    }

    if (sessionUserId && sessionUserId !== creatorUserId) {
      const sessionAuth = await getUserServiceAuth({
        context,
        userId: sessionUserId,
        serviceName: "spotify",
      })
      if (sessionAuth?.accessToken) {
        await storeUserServiceAuth({
          context,
          userId: creatorUserId,
          serviceName: "spotify",
          tokens: {
            accessToken: sessionAuth.accessToken,
            refreshToken: sessionAuth.refreshToken,
            expiresAt: sessionAuth.expiresAt,
            metadata: sessionAuth.metadata,
          },
        })
        console.log(
          `[createRoom] Associated Spotify tokens from session user ${sessionUserId} with creator ${creatorUserId}`,
        )
        return true
      }
    }

    return false
  } catch (e) {
    console.warn("[createRoom] ensureCreatorSpotifyAuth failed (continuing without Spotify):", e)
    return false
  }
}
