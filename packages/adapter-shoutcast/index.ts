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
      cron: "*/10 * * * * *", // Every 10 seconds
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

          // If fetchMeta is enabled, try to enrich with metadata from MetadataSource
          if (room.fetchMeta && room.metadataSourceId) {
            try {
              const { AdapterService } = await import("@repo/server/services/AdapterService")
              const adapterService = new AdapterService(context)

              // Get room-specific metadata source (uses creator's credentials)
              const metadataSource = await adapterService.getRoomMetadataSource(room.id)

              if (metadataSource?.api?.search) {
                // Parse station title (format: "Track | Artist | Album")
                const parts = station.title.split(/\|/).map((p) => p.trim())
                const trackTitle = parts[0] || station.title // Track is FIRST
                const artistName = parts[1] || "" // Artist is SECOND

                console.log(
                  `Shoutcast: Searching metadata for: track="${trackTitle}", artist="${artistName}"`,
                )

                // Search for the track
                const query = `${artistName} ${trackTitle}`.trim()
                const searchResults = await metadataSource.api.search(query)

                if (searchResults && searchResults.length > 0) {
                  // Use the first search result (enriched track data)
                  const enrichedTrack = searchResults[0]
                  console.log(`Shoutcast: ✓ Found enriched metadata for "${station.title}"`)

                  // Import makeStableTrackId for source tracking
                  const { makeStableTrackId } = await import(
                    "@repo/server/lib/makeNowPlayingFromStationMeta"
                  )

                  // Submit enriched track data via JobApi
                  await api.submitMediaData({
                    roomId,
                    data: {
                      track: enrichedTrack,
                      mediaSource: {
                        type: "shoutcast",
                        trackId: makeStableTrackId(station),
                      },
                      metadataSource: {
                        type: "spotify",
                        trackId: enrichedTrack.id,
                      },
                      stationMeta: station,
                    },
                  })
                  return
                }

                console.log(
                  `Shoutcast: ✗ No metadata found for "${station.title}", using raw station data`,
                )
              }
            } catch (enrichError: any) {
              // Token errors are expected for rooms where the creator hasn't authenticated
              if (
                enrichError?.message?.includes("token") ||
                enrichError?.message?.includes("auth")
              ) {
                console.log(
                  `Shoutcast: Metadata enrichment unavailable for room ${roomId} (auth required), using raw station data`,
                )
              } else {
                console.error(`Shoutcast: Error enriching metadata for room ${roomId}:`, enrichError)
              }
              // Fall through to use raw station data
            }
          }

          // Use raw station metadata (no enrichment or enrichment failed)
          const makeTrackFromStationMeta = (
            await import("@repo/server/lib/makeNowPlayingFromStationMeta")
          ).default
          const { makeStableTrackId } = await import(
            "@repo/server/lib/makeNowPlayingFromStationMeta"
          )

          const track = makeTrackFromStationMeta(station)

          await api.submitMediaData({
            roomId,
            data: {
              track,
              mediaSource: {
                type: "shoutcast",
                trackId: makeStableTrackId(station),
              },
              stationMeta: station,
            },
          })
        } catch (error: any) {
          console.error(`Shoutcast: Error polling station for room ${roomId}:`, error)
          // Notify server of error state
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
