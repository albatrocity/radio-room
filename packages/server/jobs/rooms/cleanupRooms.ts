import { ROOM_EXPIRE_TIME, ROOM_IDLE_PAUSE_TIME } from "../../lib/constants"
import {
  deleteRoom,
  expireRoomIn,
  findRoom,
  getRoomOnlineUserIds,
  removeRoomFromRoomList,
  removeRoomFromUserRoomList,
  getRoomLastEmptied,
  isRoomPollingPaused,
  setRoomPollingPaused,
} from "../../operations/data"
import { getTtl } from "../../operations/data/utils"
import { AppContext } from "@repo/types"

export async function cleanupRoom(context: AppContext, roomId: string) {
  const room = await findRoom({ context, roomId })
  if (!room) {
    await removeRoomFromRoomList({ context, roomId })
  }
  if (!room?.creator) {
    await deleteRoom({ context, roomId })
    return
  }

  const onlineIds = await getRoomOnlineUserIds({ context, roomId })

  // If the room creator is not online, the room is not persistent,
  // and the room has no ttl: set one
  if (!onlineIds.includes(room.creator) && !room.persistent) {
    const ttl = await getTtl({ context, key: `room:${roomId}:details` })
    if (ttl === -1) {
      console.log(
        `[cleanupRoom] Setting TTL for room ${roomId} to ${ROOM_EXPIRE_TIME}ms (24 hours)`,
      )
      await expireRoomIn({ context, roomId, ms: ROOM_EXPIRE_TIME })
      // Remove from user's room list now since the room will be deleted when TTL expires
      await removeRoomFromUserRoomList({ context, room })
    }
  }

  // Pause polling jobs for non-persistent rooms that have been empty for 15+ minutes
  // This reduces unnecessary API calls to Spotify, etc.
  if (!room.persistent) {
    await checkAndPauseIdleRoomPolling(context, roomId, room.mediaSourceId)
  }
}

/**
 * Check if a room has been empty for longer than ROOM_IDLE_PAUSE_TIME
 * and pause its polling jobs if so.
 */
async function checkAndPauseIdleRoomPolling(
  context: AppContext,
  roomId: string,
  mediaSourceId: string | undefined,
) {
  // Skip if already paused
  const alreadyPaused = await isRoomPollingPaused({ context, roomId })
  if (alreadyPaused) {
    return
  }

  // Check when the room became empty
  const lastEmptied = await getRoomLastEmptied({ context, roomId })
  if (!lastEmptied) {
    // Room is not empty or timestamp was cleared
    return
  }

  const emptyDuration = Date.now() - lastEmptied
  if (emptyDuration < ROOM_IDLE_PAUSE_TIME) {
    // Not idle long enough yet
    return
  }

  // Room has been empty for 15+ minutes - pause polling jobs
  console.log(
    `[cleanupRoom] Room ${roomId} has been empty for ${Math.round(emptyDuration / 60000)} minutes, pausing polling jobs`,
  )

  // Disable the media source polling job
  if (mediaSourceId && context.jobService) {
    const jobName = getMediaSourceJobName(mediaSourceId, roomId)
    context.jobService.disableJob(jobName)
    console.log(`[cleanupRoom] Disabled polling job: ${jobName}`)
  }

  // Mark the room as having polling paused
  await setRoomPollingPaused({ context, roomId, paused: true })
}

/**
 * Get the job name for a media source polling job.
 * Each adapter follows a naming convention: `{adapter}-{roomId}` or `{adapter}-player-{roomId}`
 */
function getMediaSourceJobName(mediaSourceId: string, roomId: string): string {
  // Spotify uses "spotify-player-{roomId}", Shoutcast uses "shoutcast-{roomId}"
  if (mediaSourceId === "spotify") {
    return `spotify-player-${roomId}`
  }
  return `${mediaSourceId}-${roomId}`
}
