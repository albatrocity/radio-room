import {
  MetadataSourceAdapter,
  PlaybackControllerAdapter,
  PlaybackControllerLifecycleCallbacks,
  MetadataSourceAdapterConfig,
  MediaSourceAdapter,
} from "@repo/types"
import { getSpotifyApi } from "./lib/spotifyApi"
import { makeApi as makePlaybackControllerApi } from "./lib/playbackControllerApi"
import { makeApi as makeMetadataSourceApi } from "./lib/metadataSourceApi"
import { mediaSource as spotifyMediaSource } from "./lib/mediaSourceAdapter"

export { createSpotifyAuthRoutes } from "./lib/authRoutes"
export { createSpotifyServiceAuthAdapter } from "./lib/serviceAuth"
export { createJukeboxPollingJob } from "./lib/jukeboxJob"

// Export the MediaSource adapter
export const mediaSource: MediaSourceAdapter = spotifyMediaSource

export const playbackController: PlaybackControllerAdapter = {
  register: async (config: PlaybackControllerLifecycleCallbacks) => {
    const { authentication, name, onRegistered, onError } = config
    try {
      if (authentication.type !== "oauth") {
        throw new Error("Invalid authentication type")
      }

      const spotifyApi = await getSpotifyApi(config)
      const api = await makePlaybackControllerApi({
        token: spotifyApi.token,
        clientId: spotifyApi.clientId,
        config,
      })

      await onRegistered({ api, name })

      return {
        name,
        authentication,
        api,
      }
    } catch (error) {
      console.error("Error getting Spotify API:", error)
      await onError(new Error(String(error)))
      throw error
    }
  },
}

export const metadataSource: MetadataSourceAdapter = {
  register: async (config: MetadataSourceAdapterConfig) => {
    const { authentication, name, onRegistered, onError } = config
    try {
      if (authentication.type !== "token" && authentication.type !== "oauth") {
        throw new Error("Invalid authentication type")
      }

      const spotifyApi = await getSpotifyApi(config)
      const api = await makeMetadataSourceApi({
        token: spotifyApi.token,
        clientId: spotifyApi.clientId,
        config,
      })

      onRegistered({ name })

      return {
        name,
        authentication,
        api,
      }
    } catch (error) {
      console.error("Error getting Spotify MetadataSource API:", error)
      onError(new Error(String(error)))
      throw error
    }
  },
}
