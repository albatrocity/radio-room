import { AppContext, ServiceAuthenticationAdapter } from "@repo/types"
import {
  getUserServiceAuth,
  deleteUserServiceAuth,
  storeUserServiceAuth,
} from "@repo/server/operations/data/serviceAuthentications"
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
        const auth = await getUserServiceAuth({
          context,
          userId,
          serviceName: "spotify",
        })

        return {
          isAuthenticated: !!auth?.accessToken,
          accessToken: auth?.accessToken,
          serviceName: "spotify",
        }
      } catch (error) {
        return {
          isAuthenticated: false,
          serviceName: "spotify",
        }
      }
    },

    async logout(userId: string) {
      await deleteUserServiceAuth({
        context,
        userId,
        serviceName: "spotify",
      })
    },

    async refreshAuth(userId: string) {
      const auth = await getUserServiceAuth({
        context,
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
      const refreshed = await refreshSpotifyAccessToken(
        auth.refreshToken,
        clientId,
        clientSecret,
      )

      // Store the new tokens
      const newTokens = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: Date.now() + refreshed.expiresIn * 1000,
      }

      await storeUserServiceAuth({
        context,
        userId,
        serviceName: "spotify",
        tokens: newTokens,
      })

      return newTokens
    },
  }
}
