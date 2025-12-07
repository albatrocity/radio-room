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
    // Register queue sync job for all room types (both jukebox and radio use Spotify as PlaybackController)
    console.log(`Spotify PlaybackController: Setting up queue sync for ${roomType} room ${roomId}`)

    const { createQueueSyncJob } = await import("./lib/queueSyncJob")

    const job = createQueueSyncJob({
      context,
      roomId,
      userId,
    })

    // Register the job with the JobService
    if (context.jobService) {
      const existingJob = context.jobs.find((j) => j.name === job.name)
      if (existingJob) {
        console.log(`Queue sync job for room ${roomId} already registered, skipping`)
        return
      }

      await context.jobService.scheduleJob(job)
      console.log(`Registered queue sync job for room ${roomId}`)
    }
  },

  onRoomDeleted: async ({ roomId, context }) => {
    console.log(`Spotify PlaybackController: Cleaning up queue sync for room ${roomId}`)

    const jobName = `queue-sync-${roomId}`
    if (context.jobService) {
      context.jobService.disableJob(jobName)
      console.log(`Stopped queue sync job for room ${roomId}`)
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
