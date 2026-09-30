import type { AppContext } from "@repo/types"
import { isStreamingMode } from "../lib/streamingMode"
import * as scheduling from "../services/SchedulingService"
import { findRoomsByShowIds } from "./data"
import { refreshRoomScheduleSnapshot } from "./scheduleRedisSnapshot"
import { enterStreamingMode } from "./room/applyFetchMetaTransitionEffects"

/**
 * Refresh schedule snapshots for rooms attached to shows containing the segment.
 * When `refreshStreamingDisplay` is set, also rebuild Now Playing where that
 * segment is active in streaming mode (title and image changes, and deletion).
 * Failures are logged; the primary mutation already succeeded (ADR 0028).
 *
 * Pass `showIds` when the segment row is already gone (delete cascades
 * `show_segment`, so a lookup by segment id would miss).
 */
export async function afterSegmentChanged(
  context: AppContext | undefined,
  segmentId: string,
  options: { showIds?: readonly string[]; refreshStreamingDisplay: boolean },
): Promise<void> {
  if (!context) return
  try {
    const showIds = options.showIds ?? (await scheduling.findShowIdsBySegmentId(segmentId))
    const rooms = await findRoomsByShowIds(context, new Set(showIds))
    for (const { roomId, room } of rooms) {
      await refreshRoomScheduleSnapshot(context, roomId)
      if (
        options.refreshStreamingDisplay &&
        room.activeSegmentId === segmentId &&
        isStreamingMode(room)
      ) {
        await enterStreamingMode(context, roomId)
      }
    }
  } catch (e) {
    console.error("[segmentChanged] refresh after segment change failed", segmentId, e)
  }
}
