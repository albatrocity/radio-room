import { AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { omit } from "remeda"
import {
  clearQueue,
  clearRoomCurrent,
  findRoom,
  getUser,
  saveRoom,
  clearRoomPlaylist,
} from "../operations/data"
import handleRoomNowPlayingData from "../operations/room/handleRoomNowPlayingData"
import { makeStableTrackId } from "../lib/makeNowPlayingFromStationMeta"
import systemMessage from "../lib/systemMessage"

/**
 * A service that handles admin operations without Socket.io dependencies
 */
export class AdminService {
  constructor(private context: AppContext) {}

  /**
   * Check if a user is an admin for a room
   */
  async getAuthedRoom(roomId: string, userId: string) {
    const room = await findRoom({ context: this.context, roomId })
    const isAdmin = userId === room?.creator

    if (!room) {
      return { room: null, isAdmin: false, error: null }
    }

    if (!isAdmin) {
      return {
        room: null,
        isAdmin: false,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      }
    }

    return { room, isAdmin: true, error: null }
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
  async kickUser(user: User) {
    const { userId } = user
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

    const turningOffFetch = !newSettings.fetchMeta && room.fetchMeta
    const turningOnFetch = newSettings.fetchMeta && !room.fetchMeta

    // Save room settings FIRST so handleRoomNowPlayingData sees the correct fetchMeta value
    await saveRoom({ context: this.context, room: newSettings })

    if (turningOffFetch || turningOnFetch) {
      const current = await clearRoomCurrent({ context: this.context, roomId: room.id })
      const stationMeta = current?.stationMeta

      // Construct a proper MediaSourceSubmission from station meta
      if (stationMeta?.title) {
        // Parse the station meta title (format: "title | artist | album")
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
          context: this.context,
          roomId: room.id,
          submission,
        })
      }
    }

    const updatedRoom = await findRoom({ context: this.context, roomId })

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
}
