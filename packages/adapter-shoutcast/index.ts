import { MediaSourceAdapter } from "@repo/types"
import { parseJsonString } from "@repo/utils/json"
import getStation from "./lib/shoutcast"
import { stationSchema } from "./lib/schemas"

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

    // Import required functions
    const handleRoomNowPlayingData = (await import("@repo/server/operations/room/handleRoomNowPlayingData")).default
    const makeNowPlayingFromStationMeta = (await import("@repo/server/lib/makeNowPlayingFromStationMeta")).default

    // Create the polling job
    const job = {
      name: `shoutcast-${roomId}`,
      description: `Polls Shoutcast station metadata for room ${roomId}`,
      cron: "*/10 * * * * *", // Every 10 seconds
      enabled: true,
      runAt: Date.now(),
      handler: async ({ cache }: { cache: any }) => {
        try {
          const cacheKey = `room:${roomId}:shoutcast:lastTitle`
          const cachedTitle = await cache.get(cacheKey)

          // Fetch station metadata
          const station = await getStation(streamUrl, streamProtocol)

          // Check if the title has changed
          if (!station.title || station.title === cachedTitle) {
            return
          }

          console.log(`Shoutcast: New track detected for room ${roomId}: ${station.title}`)

          // Update cache
          await cache.set(cacheKey, station.title)

          // If fetchMeta is enabled, try to enrich with metadata from MetadataSource
          // Uses the room creator's Spotify auth token (configured per-room)
          if (room.fetchMeta && room.metadataSourceId) {
            try {
              const { AdapterService } = await import("@repo/server/services/AdapterService")
              const adapterService = new AdapterService(context)
              
              // Get room-specific metadata source (uses creator's credentials)
              const metadataSource = await adapterService.getRoomMetadataSource(room.id)

              if (metadataSource?.api?.search) {
                // Parse station title (format: "Track | Artist | Album")
                const parts = station.title.split(/\|/).map(p => p.trim())
                const trackTitle = parts[0] || station.title  // Track is FIRST
                const artistName = parts[1] || ""              // Artist is SECOND

                console.log(`Shoutcast: Searching metadata for: track="${trackTitle}", artist="${artistName}"`)

                // Search for the track
                const query = `${artistName} ${trackTitle}`.trim()
                const searchResults = await metadataSource.api.search(query)

                if (searchResults && searchResults.length > 0) {
                  // Use the first search result (enriched track data)
                  const enrichedTrack = searchResults[0]
                  console.log(`Shoutcast: ✓ Found enriched metadata for "${station.title}"`)
                  console.log(`Shoutcast: - Track: ${enrichedTrack.title}`)
                  console.log(`Shoutcast: - Artist: ${enrichedTrack.artists?.[0]?.title || 'Unknown'}`)
                  console.log(`Shoutcast: - Spotify ID: ${enrichedTrack.id}`)
                  console.log(`Shoutcast: - URLs: ${enrichedTrack.urls?.length || 0}`, enrichedTrack.urls)
                  console.log(`Shoutcast: - Images: ${enrichedTrack.images?.length || 0}`, enrichedTrack.images)
                  console.log(`Shoutcast: - Album images: ${enrichedTrack.album?.images?.length || 0}`, enrichedTrack.album?.images)

                  // Import makeStableTrackId for source tracking
                  const { makeStableTrackId } = await import("@repo/server/lib/makeNowPlayingFromStationMeta")
                  
                  const nowPlaying = {
                    title: enrichedTrack.title,
                    track: enrichedTrack,
                    // NEW: Populate both mediaSource (Shoutcast) and metadataSource (Spotify)
                    mediaSource: {
                      type: "shoutcast" as const,
                      trackId: makeStableTrackId(station),
                    },
                    metadataSource: {
                      type: "spotify" as const,
                      trackId: enrichedTrack.id,
                    },
                    addedAt: Date.now(),
                    addedBy: undefined,
                    addedDuring: "nowPlaying" as const,
                    playedAt: Date.now(),
                  }

                  await handleRoomNowPlayingData({
                    context,
                    roomId,
                    nowPlaying,
                    stationMeta: station,
                    forcePublish: false,
                  })
                  return
                }

                console.log(`Shoutcast: ✗ No metadata found for "${station.title}", using raw station data`)
              }
            } catch (enrichError: any) {
              // Token errors are expected for rooms where the creator hasn't authenticated
              // Just log a warning and fall back to raw station data
              if (enrichError?.message?.includes('token') || enrichError?.message?.includes('auth')) {
                console.log(`Shoutcast: Metadata enrichment unavailable for room ${roomId} (auth required), using raw station data`)
              } else {
                console.error(`Shoutcast: Error enriching metadata for room ${roomId}:`, enrichError)
              }
              // Fall through to use raw station data
            }
          }

          // Use raw station metadata (no enrichment or enrichment failed)
          const nowPlaying = await makeNowPlayingFromStationMeta(station)
          await handleRoomNowPlayingData({
            context,
            roomId,
            nowPlaying,
            stationMeta: station,
            forcePublish: false,
          })
        } catch (error) {
          console.error(`Shoutcast: Error polling station for room ${roomId}:`, error)
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
