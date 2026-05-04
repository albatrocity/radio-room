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
export { createPlayerQueryJob } from "./lib/playerQueryJob"
export { createQueueSyncJob } from "./lib/queueSyncJob"
export { createTrackAdvanceJob } from "./lib/trackAdvanceJob"

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

      await onRegistered?.({ api, name })

      return {
        name,
        authentication,
        api,
      }
    } catch (error) {
      console.error("Error getting Spotify API:", error)
      await onError?.(new Error(String(error)))
      throw error
    }
  },

  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    // Register queue sync (Spotify-mirrored) and track advance (app-controlled) jobs.
    // Each handler no-ops when the room's playbackMode does not apply.
    console.log(`Spotify PlaybackController: Setting up queue jobs for ${roomType} room ${roomId}`)

    if (context.jobService) {
      const { createQueueSyncJob } = await import("./lib/queueSyncJob")
      const { createTrackAdvanceJob } = await import("./lib/trackAdvanceJob")
      const { AdapterService } = await import("@repo/server/services/AdapterService")

      const queueSyncJob = createQueueSyncJob({ context, roomId, userId })
      if (!context.jobs.find((j) => j.name === queueSyncJob.name)) {
        await context.jobService.scheduleJob(queueSyncJob)
        console.log(`Registered queue sync job for room ${roomId}`)
      }

      const adapterService = new AdapterService(context)
      const playbackController = await adapterService.getRoomPlaybackController(roomId)

      if (playbackController) {
        const trackAdvanceJob = createTrackAdvanceJob({
          context,
          roomId,
          userId,
          playTrack: (uri) => playbackController.api.playTrack(uri),
        })
        if (!context.jobs.find((j) => j.name === trackAdvanceJob.name)) {
          await context.jobService.scheduleJob(trackAdvanceJob)
          console.log(`Registered track advance job for room ${roomId}`)
        }
      } else {
        console.warn(
          `[Spotify PlaybackController] No playback controller for room ${roomId}; track advance job not registered`,
        )
      }
    }
  },

  onRoomDeleted: async ({ roomId, context }) => {
    console.log(`Spotify PlaybackController: Cleaning up queue jobs for room ${roomId}`)

    if (context.jobService) {
      context.jobService.disableJob(`queue-sync-${roomId}`)
      context.jobService.disableJob(`track-advance-${roomId}`)
      console.log(`Stopped queue sync and track advance jobs for room ${roomId}`)
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

      await onRegistered?.({ name })

      return {
        name,
        authentication,
        api,
      }
    } catch (error) {
      console.error("Error getting Spotify MetadataSource API:", error)
      await onError?.(new Error(String(error)))
      throw error
    }
  },
}
