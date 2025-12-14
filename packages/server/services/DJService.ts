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
  removeFromQueue,
  updateUserAttributes,
} from "../operations/data"
import systemMessage from "../lib/systemMessage"
import { queueItemFactory } from "@repo/factories"
import { AdapterService } from "./AdapterService"

/**
 * A service that handles DJ-related operations without Socket.io dependencies
 */
export class DJService {
  private adapterService: AdapterService

  constructor(private context: AppContext) {
    this.adapterService = new AdapterService(context)
  }

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
   * Add a song to the queue using the room's PlaybackController adapter
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

    // Get the room to find the creator
    const room = await findRoom({ context: this.context, roomId })

    if (!room) {
      return {
        success: false,
        message: "Room not found",
      }
    }

    // Get the room's playback controller
    const playbackController = await this.adapterService.getRoomPlaybackController(roomId)

    if (!playbackController) {
      return {
        success: false,
        message: "No playback controller configured for this room",
      }
    }

    // Get metadata source with room creator's tokens (so guests can queue songs)
    const metadataSource = await this.adapterService.getUserMetadataSource(roomId, room.creator)

    if (!metadataSource) {
      return {
        success: false,
        message: "No metadata source configured for this room",
      }
    }

    // Fetch track metadata
    let track: MetadataSourceTrack | null

    try {
      track = await metadataSource.api.findById(trackId)
      if (!track) {
        return {
          success: false,
          message: "Track not found",
        }
      }
    } catch (error) {
      return {
        success: false,
        message: "Failed to fetch track information",
        error,
      }
    }

    // Get the resource URL (e.g., Spotify URI) from the track metadata
    const resourceUrl = track.urls.find((url) => url.type === "resource")?.url
    if (!resourceUrl) {
      return {
        success: false,
        message: "Track resource URL not found",
      }
    }

    // IMPORTANT: Store in our internal queue FIRST, before adding to Spotify.
    // This prevents a race condition where Spotify immediately plays the track
    // (when queue is empty) before we've stored it, causing the DJ attribution to fail.
    const queuedItem = queueItemFactory.build({
      track,
      mediaSource: {
        type: "spotify",
        trackId: track.id,
      },
      metadataSource: {
        type: "spotify",
        trackId: track.id,
      },
      addedBy: {
        userId,
        username,
      },
      addedAt: Date.now(), // When the song was added to queue
      addedDuring: undefined, // Not playing during another track
      playedAt: undefined, // Hasn't played yet
    })

    await addToQueue({ context: this.context, roomId, item: queuedItem })

    // Now add to Spotify's queue
    try {
      await playbackController.api.addToQueue(resourceUrl)
    } catch (error) {
      // If adding to Spotify fails, remove from our internal queue to stay in sync
      console.error("Failed to add to playback queue:", error)
      const trackKey = `${queuedItem.mediaSource.type}:${queuedItem.mediaSource.trackId}`
      await removeFromQueue({ context: this.context, roomId, trackId: trackKey })
      return {
        success: false,
        message: "Failed to add track to playback queue",
        error,
      }
    }

    // Emit QUEUE_CHANGED event
    if (this.context.systemEvents) {
      const updatedQueue = await getQueue({ context: this.context, roomId })
      await this.context.systemEvents.emit(roomId, "QUEUE_CHANGED", {
        roomId,
        queue: updatedQueue,
      })
    }

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
      console.log("[DJService.savePlaylist] Starting:", {
        userId,
        name,
        trackCount: trackIds.length,
      })

      if (metadataSource.api.createPlaylist === undefined) {
        console.log("[DJService.savePlaylist] createPlaylist not supported")
        return {
          success: false,
          message: "Playlist creation is not supported by this source",
          error: { message: "Playlist creation is not supported by this source" },
        }
      }

      console.log("[DJService.savePlaylist] Calling createPlaylist API")
      const data = await metadataSource.api.createPlaylist({
        title: name,
        trackIds,
        userId,
      })

      console.log("[DJService.savePlaylist] Success:", data)
      return {
        success: true,
        data,
      }
    } catch (error: any) {
      console.error("[DJService.savePlaylist] Error:", error)
      return {
        success: false,
        message: error?.message || "Failed to save playlist",
        error: { message: error?.message || String(error) },
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
