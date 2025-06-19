import { AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { QueueItem } from "@repo/types/Queue"
import { MetadataSource, MetadataSourceTrack } from "@repo/types"
import {
  addDj,
  addToQueue,
  findRoom,
  getDjs,
  getQueue,
  getUser,
  isDj,
  removeDj,
  updateUserAttributes,
} from "../operations/data"
import systemMessage from "../lib/systemMessage"
import { queueItemFactory } from "@repo/factories"

/**
 * A service that handles DJ-related operations without Socket.io dependencies
 */
export class DJService {
  constructor(private context: AppContext) {}

  /**
   * Deputize or undeputize a user as a DJ
   */
  async deputizeUser(roomId: string, userId: User["userId"]) {
    const storedUser = await getUser({ context: this.context, userId })
    const socketId = storedUser?.id

    let eventType, message, isDeputyDj

    const userIsDj = await isDj({ context: this.context, roomId, userId })

    // Toggle the user's DJ status
    if (userIsDj) {
      eventType = "END_DEPUTY_DJ_SESSION"
      message = "You are no longer a deputy DJ"
      isDeputyDj = false
      await removeDj({ context: this.context, roomId, userId })
    } else {
      eventType = "START_DEPUTY_DJ_SESSION"
      message = "You've been promoted to a deputy DJ. You may now add songs to the DJ's queue."
      isDeputyDj = true
      await addDj({ context: this.context, roomId, userId })
    }

    const { user, users } = await updateUserAttributes({
      context: this.context,
      userId,
      attributes: { isDeputyDj },
      roomId,
    })

    return {
      user,
      users,
      socketId,
      eventType,
      message,
      systemMessage: systemMessage(message, { type: "alert", status: "info" }),
    }
  }

  /**
   * Add a song to the queue
   */
  async queueSong(
    roomId: string,
    userId: string,
    username: string,
    trackId: QueueItem["track"]["id"],
  ) {
    // Get the current queue
    const queue = await getQueue({ context: this.context, roomId })

    // Check if the song is already in the queue
    const inQueue = queue.find((x) => x.track.id === trackId)

    if (inQueue) {
      const djUsername =
        (await getUser({ context: this.context, userId: inQueue.addedBy?.userId! }))?.username ??
        "Someone"

      return {
        success: false,
        message:
          inQueue.addedBy?.userId === userId
            ? "You've already queued that song, please choose another"
            : `${djUsername} has already queued that song. Please try a different song.`,
      }
    }

    // TODO: This would need to be properly implemented to fetch the track
    // For now, using an empty object to match the original implementation
    const track = {} as MetadataSourceTrack

    const queuedItem = queueItemFactory.build({
      track,
      addedBy: {
        userId,
        username,
      },
    })

    await addToQueue({ context: this.context, roomId, item: queuedItem })

    return {
      success: true,
      queuedItem,
      systemMessage: systemMessage(`${username || "Someone"} added a song to the queue`),
    }
  }

  /**
   * Search for tracks using a metadata source
   */
  async searchForTrack(metadataSource: MetadataSource, query: string) {
    try {
      const data = await metadataSource.api.search(query)
      return {
        success: true,
        data,
      }
    } catch (e) {
      return {
        success: false,
        message:
          "Something went wrong when trying to search for tracks. You might need to log in to Spotify's OAuth",
        error: e,
      }
    }
  }

  /**
   * Save a playlist to a metadata source
   */
  async savePlaylist(
    metadataSource: MetadataSource,
    userId: string,
    name: string,
    trackIds: QueueItem["track"]["id"][],
  ) {
    try {
      if (metadataSource.api.createPlaylist === undefined) {
        return {
          success: false,
          message: "Playlist creation is not supported by this source",
        }
      }

      const data = await metadataSource.api.createPlaylist({
        title: name,
        trackIds,
        userId,
      })

      return {
        success: true,
        data,
      }
    } catch (error) {
      return {
        success: false,
        error,
      }
    }
  }

  /**
   * Handle a user joining, automatically deputizing them if needed
   */
  async handleUserJoined(roomId: string, user: User) {
    const room = await findRoom({ context: this.context, roomId })
    const deputyDjs = await getDjs({ context: this.context, roomId })

    const shouldDeputize = room?.deputizeOnJoin && !deputyDjs.includes(user.userId)

    if (shouldDeputize) {
      return {
        shouldDeputize: true,
        userId: user.userId,
      }
    }

    return {
      shouldDeputize: false,
    }
  }
}
