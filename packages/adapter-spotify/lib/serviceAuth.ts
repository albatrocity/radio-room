import { AppContext, ServiceAuthenticationAdapter, ServiceAuthenticationTokens } from "@repo/types"
import { refreshSpotifyAccessToken } from "./operations/refreshSpotifyAccessToken"

/**
 * Coalesce concurrent Spotify refreshAuth calls per user.
 * Spotify may rotate refresh tokens; parallel refreshes race and produce intermittent
 * "Bad or expired token" failures (bridge TOKEN_REQUEST + 1Hz getPlayback + jobs).
 */
const refreshInFlight = new Map<string, Promise<ServiceAuthenticationTokens>>()

/**
 * Spotify Service Authentication Adapter
 * Implements the generic ServiceAuthenticationAdapter interface
 */
export function createSpotifyServiceAuthAdapter(context: AppContext): ServiceAuthenticationAdapter {
  return {
    serviceName: "spotify",

    async getAuthStatus(userId: string) {
      try {
        if (!context.data?.getUserServiceAuth) {
          return {
            isAuthenticated: false,
            serviceName: "spotify",
            error: "getUserServiceAuth not available in context",
          }
        }

        const auth = await context.data.getUserServiceAuth({
          userId,
          serviceName: "spotify",
        })

        return {
          isAuthenticated: !!auth?.accessToken,
          accessToken: auth?.accessToken,
          serviceName: "spotify",
        }
      } catch (error) {
        console.error("Error checking Spotify auth status:", error)
        return {
          isAuthenticated: false,
          serviceName: "spotify",
        }
      }
    },

    async logout(userId: string) {
      if (!context.data?.deleteUserServiceAuth) {
        throw new Error("deleteUserServiceAuth not available in context")
      }
      await context.data.deleteUserServiceAuth({
        userId,
        serviceName: "spotify",
      })
    },

    async refreshAuth(userId: string) {
      const existing = refreshInFlight.get(userId)
      if (existing) {
        return existing
      }

      const promise = (async (): Promise<ServiceAuthenticationTokens> => {
        if (!context.data?.getUserServiceAuth || !context.data?.storeUserServiceAuth) {
          throw new Error("Data operations not available in context")
        }

        const auth = await context.data.getUserServiceAuth({
          userId,
          serviceName: "spotify",
        })

        if (!auth?.refreshToken) {
          throw new Error("No refresh token available")
        }

        const clientId = process.env.SPOTIFY_CLIENT_ID
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET

        if (!clientId || !clientSecret) {
          throw new Error("Spotify client credentials not configured")
        }

        const refreshed = await refreshSpotifyAccessToken(auth.refreshToken, clientId, clientSecret)

        const newTokens = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          expiresAt: Date.now() + refreshed.expiresIn * 1000,
        }

        await context.data.storeUserServiceAuth({
          userId,
          serviceName: "spotify",
          tokens: newTokens,
        })

        context.redis.pubClient.publish(
          "SPOTIFY:USER_ACCESS_TOKEN_REFRESHED",
          JSON.stringify({ userId, accessToken: refreshed.accessToken }),
        )

        return newTokens
      })().finally(() => {
        refreshInFlight.delete(userId)
      })

      refreshInFlight.set(userId, promise)
      return promise
    },
  }
}
