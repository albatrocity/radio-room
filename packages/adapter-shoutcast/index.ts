import { MediaSourceAdapter } from "@repo/types"
import { parseJsonString } from "@repo/utils/json"
import getStation from "./lib/shoutcast"
import { stationSchema } from "./lib/schemas"

export const mediaSource: MediaSourceAdapter = {
  register: async (config) => {
    const { authentication, name, url, onRegistered, onError, registerJob } = config
    try {
      await registerJob({
        name: "shoutcast-metadata-fetcher",
        cron: "*/5 * * * *",
        handler: async ({ cache }) => {
          const cachedStationData = parseJsonString(await cache.get("stationData"), stationSchema)

          const station = await getStation(url)

          // Check if the data is different from the cached data
          if (station.title && cachedStationData.title !== station.title) {
            await config.onMediaData({
              query: station.title,
            })
          }

          // Check if the station is online
          if (cachedStationData.bitrate !== station.bitrate) {
            if (station.bitrate) {
              await config.onOnline()
            } else {
              await config.onOffline()
            }
          }

          // Cache changes
          if (
            cachedStationData.title !== station.title ||
            cachedStationData.bitrate !== station.bitrate
          ) {
            await cache.set("stationData", JSON.stringify(station))
          }
        },
        description: "Fetches metadata from Shoutcast server",
        enabled: true,
        runAt: Date.now(),
      })

      await onRegistered({ name })

      return {
        name,
        authentication,
      }
    } catch (error) {
      console.error("Error registering Shoutcast Media Source:", error)
      await onError(new Error(String(error)))
      throw error
    }
  },
}
