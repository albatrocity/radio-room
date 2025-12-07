import { MetadataSourceAdapter, MetadataSourceAdapterConfig } from "@repo/types"
import { getTidalApi } from "./lib/tidalApi"
import { makeApi } from "./lib/metadataSourceApi"

export { createTidalAuthRoutes } from "./lib/authRoutes"
export { createTidalServiceAuthAdapter } from "./lib/serviceAuth"

/**
 * Tidal MetadataSource Adapter
 *
 * Provides track search and metadata lookup from Tidal's API.
 * Uses server-side OAuth flow with room creator's credentials.
 */
export const metadataSource: MetadataSourceAdapter = {
  register: async (config: MetadataSourceAdapterConfig) => {
    const { authentication, name, onRegistered, onError } = config

    try {
      if (authentication.type !== "token" && authentication.type !== "oauth") {
        throw new Error("Invalid authentication type for Tidal adapter")
      }

      // Get stored tokens to extract tidalUserId from metadata
      const storedTokens = await authentication.getStoredTokens()
      const tidalUserId = storedTokens.metadata?.tidalUserId as string | undefined

      const client = await getTidalApi(config)
      const api = await makeApi({
        client,
        config,
        tidalUserId,
      })

      await onRegistered?.({ name })

      return {
        name,
        authentication,
        api,
      }
    } catch (error) {
      console.error("Error registering Tidal MetadataSource:", error)
      await onError?.(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  },
}

