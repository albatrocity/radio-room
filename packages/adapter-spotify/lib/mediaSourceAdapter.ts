import { MediaSourceAdapter, MediaSourceAdapterConfig } from "@repo/types"

export const mediaSource: MediaSourceAdapter = {
  register: async (config: MediaSourceAdapterConfig) => {
    const { authentication, name, onRegistered, onError } = config
    try {
      // MediaSource for Spotify doesn't need authentication
      // Authentication is handled by the PlaybackController
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

    // Import and create the jukebox polling job
    const { createJukeboxPollingJob } = await import("./jukeboxJob")
    const handleRoomNowPlayingData = (
      await import("@repo/server/operations/room/handleRoomNowPlayingData")
    ).default
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
          // NEW: For Spotify jukebox, both mediaSource and metadataSource are Spotify
          mediaSource: {
            type: "spotify" as const,
            trackId: track.id,
          },
          metadataSource: {
            type: "spotify" as const,
            trackId: track.id,
          },
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
    console.log(`Spotify MediaSource: Cleaning up polling for room ${roomId}`)

    // Stop the polling job for this room
    const jobName = `spotify-jukebox-${roomId}`
    if (context.jobService) {
      context.jobService.disableJob(jobName)
      console.log(`Stopped Spotify jukebox polling job for room ${roomId}`)
    }
  },
}
