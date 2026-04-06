import { AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { omit } from "remeda"
import {
  clearQueue,
  findRoom,
  getUser,
  saveRoom,
  hDelRoomDetailsFields,
  clearRoomPlaylist,
  removeFromPlaylist,
  addAdmin,
  removeAdmin,
  isAdminMember,
  updateUserAttributes,
} from "../operations/data"
import {
  applyFetchMetaTransitionEffects,
  enterStreamingMode,
} from "../operations/room/applyFetchMetaTransitionEffects"
import { refreshRoomScheduleSnapshot } from "../operations/scheduleRedisSnapshot"
import systemMessage from "../lib/systemMessage"
import { isStreamingMode, streamingDisplayChanged } from "../lib/streamingMode"
import * as scheduling from "./SchedulingService"

/**
 * A service that handles admin operations without Socket.io dependencies
 */
export class AdminService {
  constructor(private context: AppContext) {}

  /**
   * Check if a user is an admin (creator or designated admin) for a room
   */
  async getAuthedRoom(roomId: string, userId: string) {
    const room = await findRoom({ context: this.context, roomId })

    if (!room) {
      return { room: null, isAdmin: false, error: null }
    }

    const isCreator = userId === room.creator
    const isDesignatedAdmin = await isAdminMember({ context: this.context, roomId, userId })
    const isAdmin = isCreator || isDesignatedAdmin

    if (!isAdmin) {
      return {
        room: null,
        isAdmin: false,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not a room admin.",
        },
      }
    }

    return { room, isAdmin: true, error: null }
  }

  /**
   * Toggle admin status for a user (creator-only action)
   */
  async designateAdmin(roomId: string, callerUserId: string, targetUserId: string) {
    const room = await findRoom({ context: this.context, roomId })

    if (!room || room.creator !== callerUserId) {
      return {
        error: { status: 403, error: "Forbidden", message: "Only the room creator can designate admins." },
      }
    }

    if (targetUserId === callerUserId) {
      return {
        error: { status: 400, error: "Bad Request", message: "Cannot change your own admin status." },
      }
    }

    const storedUser = await getUser({ context: this.context, userId: targetUserId })
    const socketId = storedUser?.id

    const alreadyAdmin = await isAdminMember({ context: this.context, roomId, userId: targetUserId })

    let eventType: string
    let isAdmin: boolean
    let message

    if (alreadyAdmin) {
      eventType = "END_ADMIN_SESSION"
      isAdmin = false
      await removeAdmin({ context: this.context, roomId, userId: targetUserId })
      message = systemMessage("You are no longer a room admin.", {
        status: "info",
        type: "alert",
        title: "Admin Removed",
      })
    } else {
      eventType = "START_ADMIN_SESSION"
      isAdmin = true
      await addAdmin({ context: this.context, roomId, userId: targetUserId })
      message = systemMessage("You've been promoted to a room admin.", {
        status: "success",
        type: "alert",
        title: "Admin Promoted",
      })
    }

    const { user, users } = await updateUserAttributes({
      context: this.context,
      userId: targetUserId,
      attributes: { isAdmin },
      roomId,
    })

    return { socketId, eventType, message, user, users, error: null }
  }

  /**
   * Get room settings for an admin
   */
  async getRoomSettings(roomId: string, userId: string) {
    const { room, error } = await this.getAuthedRoom(roomId, userId)

    if (!room) {
      return { room: null, error }
    }

    return { room, error: null }
  }

  /**
   * Set a room password
   */
  async setPassword(roomId: string, value: string) {
    const room = await findRoom({ context: this.context, roomId })

    if (room) {
      await saveRoom({ context: this.context, room: { ...room, password: value } })
      return { success: true }
    }

    return { success: false }
  }

  /**
   * Kick a user from a room
   */
  async kickUser(roomId: string, user: User) {
    const { userId } = user

    const room = await findRoom({ context: this.context, roomId })
    if (room && userId === room.creator) {
      return {
        socketId: null,
        message: null,
        error: { status: 403, error: "Forbidden", message: "Cannot kick the room creator." },
      }
    }

    if (room && (await isAdminMember({ context: this.context, roomId, userId }))) {
      return {
        socketId: null,
        message: null,
        error: { status: 403, error: "Forbidden", message: "Cannot kick a room admin. Remove their admin privileges first." },
      }
    }

    const storedUser = await getUser({ context: this.context, userId })
    const socketId = storedUser?.id

    const newMessage = systemMessage(`You have been kicked. I hope you deserved it.`, {
      status: "error",
      type: "alert",
      title: "Kicked",
    })

    return {
      socketId,
      message: newMessage,
      error: null,
    }
  }

  /**
   * Update room settings
   */
  async setRoomSettings(roomId: string, userId: string, values: Partial<Room>) {
    const { room, error } = await this.getAuthedRoom(roomId, userId)

    if (!room) {
      return { room: null, error }
    }

    const newSettings = {
      ...omit(room, ["spotifyError", "radioError"]),
      ...omit(values, ["spotifyError", "radioError"]),
    }
    if ("showId" in values && values.showId === null) {
      delete (newSettings as { activeSegmentId?: string | null }).activeSegmentId
    }

    if ("showId" in values) {
      const sid = values.showId
      ;(newSettings as Room).persistent = !!(sid && String(sid).length > 0)
    }

    // Save room settings FIRST so handleRoomNowPlayingData sees the correct fetchMeta value
    await saveRoom({ context: this.context, room: newSettings })

    if ("showId" in values) {
      const nextShowId =
        values.showId === null || values.showId === ""
          ? null
          : values.showId === undefined
            ? undefined
            : String(values.showId)
      try {
        await scheduling.syncShowRoomPointer({
          roomId,
          previousShowId: room.showId ?? null,
          nextShowId,
        })
      } catch (e) {
        if (e instanceof scheduling.SchedulingBadRequestError) {
          return {
            room: null,
            error: { message: e.message, code: "BAD_REQUEST" as const },
          }
        }
        console.error("[setRoomSettings] syncShowRoomPointer failed:", e)
        return {
          room: null,
          error: { message: "Failed to update show room link", code: "INTERNAL" as const },
        }
      }
    }

    const scheduleFieldsToClear: string[] = []
    if ("showId" in values && values.showId === null) {
      scheduleFieldsToClear.push("showId", "activeSegmentId")
    }
    if ("activeSegmentId" in values && values.activeSegmentId === null) {
      scheduleFieldsToClear.push("activeSegmentId")
    }
    if (scheduleFieldsToClear.length > 0) {
      await hDelRoomDetailsFields({
        context: this.context,
        roomId,
        fields: scheduleFieldsToClear,
      })
    }

    await applyFetchMetaTransitionEffects({
      context: this.context,
      roomId,
      previousFetchMeta: room.fetchMeta,
      newFetchMeta: newSettings.fetchMeta,
    })

    if (
      room.fetchMeta === newSettings.fetchMeta &&
      isStreamingMode(newSettings) &&
      streamingDisplayChanged(room, newSettings)
    ) {
      await enterStreamingMode(this.context, roomId)
    }

    const updatedRoom = await findRoom({ context: this.context, roomId })

    if ("showId" in values) {
      await refreshRoomScheduleSnapshot(this.context, roomId)
    }

    return { room: updatedRoom, error: null }
  }

  /**
   * Clear a room's playlist
   */
  async clearPlaylist(roomId: string, userId: string) {
    const { room, error } = await this.getAuthedRoom(roomId, userId)

    if (!room) {
      return { success: false, error }
    }

    await clearRoomPlaylist({ context: this.context, roomId })
    await clearQueue({ context: this.context, roomId })

    return { success: true, error: null }
  }

  /**
   * Delete a single track from a room's playlist
   */
  async deletePlaylistTrack(roomId: string, userId: string, playedAt: number) {
    const { room, error } = await this.getAuthedRoom(roomId, userId)

    if (!room) {
      return { success: false, error }
    }

    const removed = await removeFromPlaylist({ context: this.context, roomId, playedAt })

    if (!removed) {
      return {
        success: false,
        error: {
          status: 404,
          error: "Not Found",
          message: "Track not found in playlist.",
        },
      }
    }

    return { success: true, error: null }
  }
}
