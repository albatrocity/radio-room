import { PlaybackControllerAdapter } from "@repo/types"
import { getSpotifyApi } from "./lib/spotifyApi"

export const adapter: PlaybackControllerAdapter = {
  register: async (config) => {
    const { authentication, name, onRegistered, onError } = config
    try {
      const api = await getSpotifyApi(config)
      await onRegistered({ api, name })

      return {
        name,
        authentication,
        api,
      }
    } catch (error) {
      console.error("Error getting Spotify API:", error)
      await onError(error)
      throw error
    }
  },
}
