import type { AppContext } from "@repo/types"
import { clearRoomCurrent } from "../data"
import handleRoomNowPlayingData from "./handleRoomNowPlayingData"
import { makeStableTrackId } from "../../lib/makeNowPlayingFromStationMeta"

/**
 * When `fetchMeta` toggles, refresh now-playing handling from current station meta
 * (same behavior as admin setRoomSettings).
 */
export async function applyFetchMetaTransitionEffects(params: {
  context: AppContext
  roomId: string
  previousFetchMeta: boolean
  newFetchMeta: boolean
}): Promise<void> {
  const { context, roomId, previousFetchMeta, newFetchMeta } = params
  if (previousFetchMeta === newFetchMeta) return

  const current = await clearRoomCurrent({ context, roomId })
  const stationMeta = current?.stationMeta

  if (stationMeta?.title) {
    const parts = stationMeta.title.split("|").map((s) => s.trim())
    const submission = {
      trackId: makeStableTrackId(stationMeta),
      sourceType: "shoutcast" as const,
      title: parts[0] || "Unknown",
      artist: parts[1],
      album: parts[2],
      stationMeta,
    }

    await handleRoomNowPlayingData({
      context,
      roomId,
      submission,
    })
  }
}
