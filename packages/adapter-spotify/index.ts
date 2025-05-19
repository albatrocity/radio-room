import { MetadataSourceAdapter, PlaybackControllerAdapter } from "@repo/types"
import { getSpotifyApi } from "./lib/spotifyApi"
import { makeApi as makePlaybackControllerApi } from "./lib/playbackControllerApi"

export const playbackController: PlaybackControllerAdapter = {
  register: async (config) => {
    const { authentication, name, onRegistered, onError } = config
    try {
      if (config.authentication.type !== "oauth") {
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

// export const metadataSource: MetadataSourceAdapter = {
//   register: async (config) => {
//     const { authentication, name, onRegistered, onError } = config
//     try {
//       if (config.authentication.type !== "token") {
//         throw new Error("Invalid authentication type")
//       }

//       const api = await getSpotifyApi(config)
//       await onRegistered({ api, name })

//       return {
//         name,
//         authentication,
//         api,
//       }
//     } catch (error) {
//       console.error("Error getting Spotify API:", error)
//       await onError(new Error(String(error)))
//       throw error
//     }
//   },
// }
