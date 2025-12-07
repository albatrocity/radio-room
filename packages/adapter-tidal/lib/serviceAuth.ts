import { AppContext, ServiceAuthenticationAdapter } from "@repo/types"
import { refreshTidalAccessToken } from "./operations/refreshTidalAccessToken"

/**
 * Tidal Service Authentication Adapter
 * Implements the generic ServiceAuthenticationAdapter interface
 */
export function createTidalServiceAuthAdapter(context: AppContext): ServiceAuthenticationAdapter {
  return {
    serviceName: "tidal",

    async getAuthStatus(userId: string) {
      try {
        if (!context.data?.getUserServiceAuth) {
          return {
            isAuthenticated: false,
            serviceName: "tidal",
            error: "getUserServiceAuth not available in context",
          }
        }

        const auth = await context.data.getUserServiceAuth({
          userId,
          serviceName: "tidal",
        })

        return {
          isAuthenticated: !!auth?.accessToken,
          accessToken: auth?.accessToken,
          serviceName: "tidal",
        }
      } catch (error) {
        console.error("Error checking Tidal auth status:", error)
        return {
          isAuthenticated: false,
          serviceName: "tidal",
        }
      }
    },

    async logout(userId: string) {
      if (!context.data?.deleteUserServiceAuth) {
        throw new Error("deleteUserServiceAuth not available in context")
      }
      await context.data.deleteUserServiceAuth({
        userId,
        serviceName: "tidal",
      })
    },

    async refreshAuth(userId: string) {
      if (!context.data?.getUserServiceAuth || !context.data?.storeUserServiceAuth) {
        throw new Error("Data operations not available in context")
      }

      const auth = await context.data.getUserServiceAuth({
        userId,
        serviceName: "tidal",
      })

      if (!auth?.refreshToken) {
        throw new Error("No refresh token available")
      }

      const clientId = process.env.TIDAL_CLIENT_ID
      const clientSecret = process.env.TIDAL_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Tidal client credentials not configured")
      }

      // Call Tidal's token refresh endpoint
      const refreshed = await refreshTidalAccessToken(auth.refreshToken, clientId, clientSecret)

      // Store the new tokens
      const newTokens = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: Date.now() + refreshed.expiresIn * 1000,
        // Preserve metadata (tidalUserId)
        metadata: auth.metadata,
      }

      await context.data.storeUserServiceAuth({
        userId,
        serviceName: "tidal",
        tokens: newTokens,
      })

      // Publish token refresh to notify connected clients
      context.redis.pubClient.publish(
        "TIDAL:USER_ACCESS_TOKEN_REFRESHED",
        JSON.stringify({ userId, accessToken: refreshed.accessToken }),
      )

      return newTokens
    },
  }
}

