import { AppContext, ServiceAuthenticationAdapter } from "@repo/types"
import { refreshSpotifyAccessToken } from "./operations/refreshSpotifyAccessToken"

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

      // Call Spotify's token refresh endpoint
      const refreshed = await refreshSpotifyAccessToken(auth.refreshToken, clientId, clientSecret)

      // Store the new tokens
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

      return newTokens
    },
  }
}
