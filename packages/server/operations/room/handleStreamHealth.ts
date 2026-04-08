import type { AppContext } from "@repo/types"
import { findRoom, clearRoomCurrent } from "../data"
import { hasListenableStream } from "../../lib/roomTypeHelpers"

type HandleStreamHealthParams = {
  context: AppContext
  roomId: string
  status: "online" | "offline"
}

/**
 * Updates a live room's media-source status based on the MediaMTX
 * stream health webhook (runOnReady / runOnNotReady).
 *
 * This is the sole authority for online/offline status in live rooms;
 * NOW_PLAYING_CHANGED only updates track metadata.
 */
export default async function handleStreamHealth({
  context,
  roomId,
  status,
}: HandleStreamHealthParams) {
  const room = await findRoom({ context, roomId })
  if (!room || !hasListenableStream(room)) return

  const sourceType = room.type as "radio" | "live"

  if (status === "offline") {
    await clearRoomCurrent({ context, roomId })
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "STREAM_HEALTH_CHANGED", {
      roomId,
      status,
    })

    await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
      roomId,
      status,
      sourceType,
    })
  }
}
