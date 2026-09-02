import { AppContext, RoomScheduleSnapshotDTO } from "@repo/types"
import { RoomSnapshot } from "@repo/types/Room"
import {
  findRoom,
  getMessagesSince,
  getRoomPlaylistSince,
  removeSensitiveRoomAttributes,
  isRoomAdmin,
} from "../operations/data"
import { readRoomScheduleSnapshot } from "../operations/scheduleRedisSnapshot"
import { loadPollRoomDataSince } from "../operations/polls/loadPollSnapshot"
import { loadFeedbackRoomData } from "../operations/feedback/loadFeedbackSnapshot"

/**
 * A service that handles Room-related operations without Socket.io dependencies
 */
export class RoomService {
  constructor(private context: AppContext) {}

  /**
   * Get room settings
   */
  async getRoomSettings(roomId: string, userId: string) {
    if (!roomId) {
      return null
    }

    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return null
    }

    const isAdmin = await isRoomAdmin({ context: this.context, roomId, userId, roomCreator: room.creator })

    return {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
      isAdmin,
    }
  }

  /**
   * Get latest room data since a snapshot
   */
  async getLatestRoomData(roomId: string, userId: string, snapshot: RoomSnapshot) {
    if (!roomId) {
      return null
    }

    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return null
    }

    const isAdmin = await isRoomAdmin({ context: this.context, roomId, userId, roomCreator: room.creator })

    const messages = await getMessagesSince({
      context: this.context,
      roomId: room.id,
      since: snapshot.lastMessageTime,
    })

    const playlist = await getRoomPlaylistSince({
      context: this.context,
      roomId: room.id,
      since: snapshot.lastPlaylistItemTime,
    })

    let scheduleSnapshot: RoomScheduleSnapshotDTO | null = null
    if (room.showId) {
      scheduleSnapshot = await readRoomScheduleSnapshot(this.context, roomId)
    }

    const pollData = await loadPollRoomDataSince({
      context: this.context,
      roomId: room.id,
      since: snapshot.lastPollChange,
    })

    const feedbackData = await loadFeedbackRoomData({
      context: this.context,
      roomId: room.id,
      userId,
    })

    return {
      room: isAdmin ? room : removeSensitiveRoomAttributes(room),
      messages,
      playlist,
      scheduleSnapshot,
      activePoll: pollData.activePoll,
      totalVotes: pollData.totalVotes,
      pollHistorySince: pollData.pollHistorySince,
      feedbackTopics: feedbackData.feedbackTopics,
      myFeedbackResponses: feedbackData.myFeedbackResponses,
    }
  }
}
