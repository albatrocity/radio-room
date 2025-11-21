import {
  MetadataSourceAdapter,
  PlaybackControllerAdapter,
  PlaybackControllerLifecycleCallbacks,
  MetadataSourceAdapterConfig,
  AppContext,
} from "@repo/types"
import { getSpotifyApi } from "./lib/spotifyApi"
import { makeApi as makePlaybackControllerApi } from "./lib/playbackControllerApi"
import { makeApi as makeMetadataSourceApi } from "./lib/metadataSourceApi"

export { createSpotifyAuthRoutes } from "./lib/authRoutes"
export { createSpotifyServiceAuthAdapter } from "./lib/serviceAuth"
export { createJukeboxPollingJob } from "./lib/jukeboxJob"

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

  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    // Only register polling job for jukebox rooms
    if (roomType !== "jukebox") {
      return
    }

    console.log(`Spotify adapter: Setting up polling for room ${roomId}`)

    // Import and create the jukebox polling job
    const { createJukeboxPollingJob } = await import("./lib/jukeboxJob")
    const handleRoomNowPlayingData = (await import("@repo/server/operations/room/handleRoomNowPlayingData")).default
    const { getQueue } = await import("@repo/server/operations/data")

    const job = createJukeboxPollingJob({
      context,
      roomId,
      userId,
      onTrackChange: async (track) => {
        // Check if this track is in the queue to preserve its addedAt timestamp
        const queue = await getQueue({ context, roomId })
        const queuedTrack = queue.find((item) => item.track.id === track.id)

        // Transform track to QueueItem format
        const nowPlaying = {
          title: track.title,
          track,
          addedAt: queuedTrack?.addedAt ?? Date.now(), // Preserve queue timestamp if available
          addedBy: queuedTrack?.addedBy ?? undefined,
          addedDuring: "nowPlaying" as const,
          playedAt: Date.now(),
        }

        // Update room's now playing data - fire and forget
        handleRoomNowPlayingData({
          context,
          roomId,
          nowPlaying,
          forcePublish: false,
        }).catch((err) => {
          console.error(`Error updating now playing data for room ${roomId}:`, err)
        })
      },
    })

    // Register the job with the JobService (check if not already registered)
    if (context.jobService) {
      const existingJob = context.jobs.find((j) => j.name === job.name)
      if (existingJob) {
        console.log(`Spotify jukebox polling job for room ${roomId} already registered, skipping`)
        return
      }
      
      await context.jobService.scheduleJob(job)
      console.log(`Registered Spotify jukebox polling job for room ${roomId}`)
    }
  },

  onRoomDeleted: async ({ roomId, context }) => {
    console.log(`Spotify adapter: Cleaning up polling for room ${roomId}`)

    // Stop the polling job for this room
    const jobName = `spotify-jukebox-${roomId}`
    if (context.jobService) {
      context.jobService.disableJob(jobName)
      console.log(`Stopped Spotify jukebox polling job for room ${roomId}`)
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

      await onRegistered({ name })

      return {
        name,
        authentication,
        api,
      }
    } catch (error) {
      console.error("Error getting Spotify MetadataSource API:", error)
      await onError(new Error(String(error)))
      throw error
    }
  },
}
