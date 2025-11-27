import { MediaSourceAdapter, JobApi, AppContext, JobRegistration } from "@repo/types"
import getStation from "./lib/shoutcast"

export const mediaSource: MediaSourceAdapter = {
  register: async (config) => {
    const { authentication, name, onRegistered, onError } = config
    try {
      // No global job registration - jobs are created per-room in onRoomCreated
      onRegistered?.({ name })

      return {
        name,
        authentication,
      }
    } catch (error) {
      console.error("Error registering Shoutcast Media Source:", error)
      onError?.(new Error(String(error)))
      throw error
    }
  },

  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    // Only register polling job for radio rooms
    if (roomType !== "radio") {
      return
    }

    console.log(`Shoutcast MediaSource: Setting up polling for radio room ${roomId}`)

    // Get the room to access its configuration
    const { findRoom } = await import("@repo/server/operations/data")
    const room = await findRoom({ context, roomId })

    if (!room || !room.mediaSourceConfig?.url) {
      console.error(`Shoutcast: No mediaSourceConfig.url found for room ${roomId}`)
      return
    }

    const streamUrl = room.mediaSourceConfig.url
    const streamProtocol = room.radioProtocol || "shoutcastv2"

    // Create the polling job
    const job: JobRegistration = {
      name: `shoutcast-${roomId}`,
      description: `Polls Shoutcast station metadata for room ${roomId}`,
      cron: "*/3 * * * * *", // Every 10 seconds
      enabled: true,
      runAt: Date.now(),
      handler: async ({ api }: { api: JobApi; context: AppContext }) => {
        try {
          // Fetch station metadata
          const station = await getStation(streamUrl, streamProtocol)

          if (!station.title) {
            // No title - media source is offline
            await api.submitMediaData({ roomId })
            return
          }

          // Generate stable track ID from station title
          const { makeStableTrackId } = await import(
            "@repo/server/lib/makeNowPlayingFromStationMeta"
          )
          const stableTrackId = makeStableTrackId(station)

          // Parse station title (format: "Track | Artist | Album")
          const parts = station.title.split(/\|/).map((p) => p.trim())
          const trackTitle = parts[0] || station.title
          const artistName = parts[1] || undefined
          const albumName = parts[2] || undefined

          // Submit raw station data - server handles enrichment via MetadataSource
          await api.submitMediaData({
            roomId,
            submission: {
              trackId: stableTrackId,
              sourceType: "shoutcast",
              title: trackTitle,
              artist: artistName,
              album: albumName,
              stationMeta: station,
            },
          })
        } catch (error: any) {
          console.error(`Shoutcast: Error polling station for room ${roomId}:`, error)
          await api.submitMediaData({
            roomId,
            error: error?.message || "Failed to fetch station data",
          })
        }
      },
    }

    // Register the job with the JobService
    if (context.jobService) {
      const existingJob = context.jobs.find((j) => j.name === job.name)
      if (existingJob) {
        console.log(`Shoutcast polling job for room ${roomId} already registered, skipping`)
        return
      }

      await context.jobService.scheduleJob(job)
      console.log(`Registered Shoutcast polling job for room ${roomId}`)
    }
  },

  onRoomDeleted: async ({ roomId, context }) => {
    console.log(`Shoutcast MediaSource: Cleaning up polling for room ${roomId}`)

    // Stop the polling job for this room
    const jobName = `shoutcast-${roomId}`
    if (context.jobService) {
      context.jobService.disableJob(jobName)
      console.log(`Stopped Shoutcast polling job for room ${roomId}`)
    }
  },
}
