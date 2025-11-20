import { AppContext, ServiceAuthenticationAdapter } from "@repo/types"
import {
  getUserServiceAuth,
  deleteUserServiceAuth,
} from "@repo/server/operations/data/serviceAuthentications"

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
      // TODO: Implement token refresh using Spotify API
      const auth = await getUserServiceAuth({
        context,
        userId,
        serviceName: "spotify",
      })

      if (!auth?.refreshToken) {
        throw new Error("No refresh token available")
      }

      // This would call Spotify's token refresh endpoint
      // For now, return the existing tokens
      return auth
    },
  }
}
