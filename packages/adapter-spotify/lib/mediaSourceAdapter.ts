import { MediaSourceAdapter, MediaSourceAdapterConfig } from "@repo/types"

/**
 * Spotify MediaSource Adapter
 *
 * This adapter:
 * - Registers a polling job for jukebox rooms
 * - The polling job fetches currently playing track from Spotify
 * - Server operations handle persistence, playlist, and event emission
 *
 * The MediaSource is purely a gateway to Spotify - it does NOT:
 * - Read/write Redis
 * - Emit system events
 * - Manage playlists or queues
 */
export const mediaSource: MediaSourceAdapter = {
  register: async (config: MediaSourceAdapterConfig) => {
    const { authentication, name, onRegistered, onError } = config
    try {
      // MediaSource for Spotify doesn't need global authentication
      // Authentication is handled per-user via PlaybackController
      onRegistered?.({ name })

      return {
        name,
        authentication,
      }
    } catch (error) {
      console.error("Error registering Spotify MediaSource:", error)
      onError?.(new Error(String(error)))
      throw error
    }
  },

  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    // Only register polling job for jukebox rooms
    if (roomType !== "jukebox") {
      return
    }

    console.log(`Spotify MediaSource: Setting up polling for jukebox room ${roomId}`)

    // Import and create the player query job
    const { createPlayerQueryJob } = await import("./playerQueryJob")

    const job = createPlayerQueryJob({
      context,
      roomId,
      userId,
    })

    // Register the job with the JobService (check if not already registered)
    if (context.jobService) {
      const existingJob = context.jobs.find((j) => j.name === job.name)
      if (existingJob) {
        console.log(`Spotify player polling job for room ${roomId} already registered, skipping`)
        return
      }

      await context.jobService.scheduleJob(job)
      console.log(`Registered Spotify player polling job for room ${roomId}`)
    }
  },

  onRoomDeleted: async ({ roomId, context }) => {
    console.log(`Spotify MediaSource: Cleaning up polling for room ${roomId}`)

    // Stop the polling job for this room
    const jobName = `spotify-player-${roomId}`
    if (context.jobService) {
      context.jobService.disableJob(jobName)
      console.log(`Stopped Spotify player polling job for room ${roomId}`)
    }
  },
}
