import { AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { QueueItem, canonicalQueueTrackKey } from "@repo/types/Queue"
import { MetadataSource, MetadataSourceTrack } from "@repo/types"
import {
  addDj,
  addToQueue,
  findRoom,
  getDjs,
  getQueue,
  getQueueWithDispatched,
  getUser,
  isDj,
  isRoomAdmin,
  removeDj,
  removeFromQueue,
  clearDispatchedTrack,
  setDispatchedTrack,
  setQueue,
  updateUserAttributes,
} from "../operations/data"
import systemMessage from "../lib/systemMessage"
import { queueItemFactory } from "@repo/factories"
import { AdapterService } from "./AdapterService"
import { isAppControlledPlayback } from "../lib/roomTypeHelpers"

function isSameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

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

    // Run plugin validation hooks (e.g., rate limiting)
    // Uses fail-open semantics: if plugins error/timeout, request proceeds
    if (this.context.pluginRegistry) {
      const validationResult = await this.context.pluginRegistry.validateQueueRequest({
        roomId,
        userId,
        username,
        trackId,
      })

      if (!validationResult.allowed) {
        return {
          success: false,
          message: validationResult.reason,
        }
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

    // Spotify-native queue (default). App-controlled: Redis-only queue; advance job / explicit Play start Spotify.
    if (!isAppControlledPlayback(room)) {
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
    }

    // Emit QUEUE_CHANGED event
    if (this.context.systemEvents) {
      const updatedQueue = isAppControlledPlayback(room)
        ? await getQueueWithDispatched({ context: this.context, roomId })
        : await getQueue({ context: this.context, roomId })
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
  /** Room creator or designated admins only (app-controlled queues). */
  async userCanReorderQueueInRoom(roomId: string, userId: string): Promise<boolean> {
    const room = await findRoom({ context: this.context, roomId })
    if (!room || !isAppControlledPlayback(room)) {
      return false
    }
    return await isRoomAdmin({
      context: this.context,
      roomId,
      userId,
      roomCreator: room.creator,
    })
  }

  /**
   * Reorder the Redis-backed queue (app-controlled only). Emits QUEUE_CHANGED via systemEvents.
   */
  async reorderQueue(roomId: string, userId: string, orderedCanonicalKeys: string[]) {
    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return { success: false as const, message: "Room not found" }
    }
    if (!isAppControlledPlayback(room)) {
      return {
        success: false as const,
        message: "Queue reordering is only available in app-controlled playback mode",
      }
    }

    const current = await getQueue({ context: this.context, roomId })
    const currentKeys = current.map((item) => canonicalQueueTrackKey(item))
    if (!isSameMultiset(currentKeys, orderedCanonicalKeys)) {
      return { success: false as const, message: "Invalid queue order" }
    }

    const allowed = await this.userCanReorderQueueInRoom(roomId, userId)
    if (!allowed) {
      return { success: false as const, message: "Not authorized to reorder the queue" }
    }

    const byKey = new Map(current.map((item) => [canonicalQueueTrackKey(item), item] as const))
    const items: QueueItem[] = []
    for (const k of orderedCanonicalKeys) {
      const item = byKey.get(k)
      if (!item) {
        return { success: false as const, message: "Invalid queue order" }
      }
      items.push(item)
    }

    await setQueue({ roomId, items, context: this.context })

    if (this.context.systemEvents) {
      const updatedQueue = await getQueueWithDispatched({ context: this.context, roomId })
      await this.context.systemEvents.emit(roomId, "QUEUE_CHANGED", {
        roomId,
        queue: updatedQueue,
      })
    }

    return { success: true as const }
  }

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

  /**
   * Remove a track from the authoritative Redis queue (app-controlled rooms).
   * Callers must enforce playback mode; verifies ownership or room admin.
   */
  async removeFromQueueDirect(roomId: string, userId: string, trackId: QueueItem["track"]["id"]) {
    const room = await findRoom({ context: this.context, roomId })

    if (!room) {
      return { success: false as const, message: "Room not found" }
    }

    if (!isAppControlledPlayback(room)) {
      return {
        success: false as const,
        message: "Direct queue removal is only available in app-controlled playback mode",
      }
    }

    const queue = await getQueue({ context: this.context, roomId })
    const queueItem = queue.find((item) => item.track.id === trackId)

    if (!queueItem) {
      return { success: false as const, message: "Track not found in queue" }
    }

    const isOwner = queueItem.addedBy?.userId === userId
    const admin =
      !isOwner &&
      (await isRoomAdmin({
        context: this.context,
        roomId,
        userId,
        roomCreator: room.creator,
      }))

    if (!isOwner && !admin) {
      return { success: false as const, message: "Not authorized to remove this track" }
    }

    const trackKey = `${queueItem.mediaSource.type}:${queueItem.mediaSource.trackId}`
    await removeFromQueue({ context: this.context, roomId, trackId: trackKey })

    if (this.context.systemEvents) {
      const updatedQueue = await getQueueWithDispatched({ context: this.context, roomId })
      await this.context.systemEvents.emit(roomId, "QUEUE_CHANGED", {
        roomId,
        queue: updatedQueue,
      })
    }

    const title = queueItem.track.title || queueItem.title || "Track"

    return { success: true as const, trackTitle: title }
  }

  /**
   * App-controlled: start a specific queued track on Spotify (owner of that item or room admin).
   */
  async playQueuedTrack(roomId: string, userId: string, trackId: QueueItem["track"]["id"]) {
    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return { success: false as const, message: "Room not found" }
    }
    if (!isAppControlledPlayback(room)) {
      return {
        success: false as const,
        message: "This action is only available in app-controlled playback mode",
      }
    }

    const queue = await getQueue({ context: this.context, roomId })
    const queueItem = queue.find((item) => item.track.id === trackId)
    if (!queueItem) {
      return { success: false as const, message: "Track not found in queue" }
    }

    const isOwner = queueItem.addedBy?.userId === userId
    const admin =
      !isOwner &&
      (await isRoomAdmin({
        context: this.context,
        roomId,
        userId,
        roomCreator: room.creator,
      }))
    if (!isOwner && !admin) {
      return { success: false as const, message: "Not authorized to play this track from the queue" }
    }

    const playbackController = await this.adapterService.getRoomPlaybackController(roomId)
    if (!playbackController) {
      return { success: false as const, message: "No playback controller configured for this room" }
    }

    const uri = queueItem.track.urls?.find((u) => u.type === "resource")?.url
    if (!uri) {
      return { success: false as const, message: "Track resource URL not found" }
    }

    const trackKey = `${queueItem.mediaSource.type}:${queueItem.mediaSource.trackId}`
    await removeFromQueue({ context: this.context, roomId, trackId: trackKey })
    await setDispatchedTrack({ context: this.context, roomId, item: queueItem })

    const playTrack = (
      playbackController.api as { playTrack?: (mediaUri: string) => Promise<void> }
    ).playTrack
    if (!playTrack) {
      await addToQueue({ context: this.context, roomId, item: queueItem })
      await clearDispatchedTrack({ context: this.context, roomId })
      return { success: false as const, message: "Playback controller does not support starting tracks" }
    }

    try {
      await playTrack(uri)
    } catch (e) {
      console.error("[DJService.playQueuedTrack] playTrack failed:", e)
      await clearDispatchedTrack({ context: this.context, roomId })
      await addToQueue({ context: this.context, roomId, item: queueItem })
      return {
        success: false as const,
        message: "Failed to start playback on Spotify",
      }
    }

    if (this.context.systemEvents) {
      const updatedQueue = await getQueueWithDispatched({ context: this.context, roomId })
      await this.context.systemEvents.emit(roomId, "QUEUE_CHANGED", {
        roomId,
        queue: updatedQueue,
      })
    }

    return {
      success: true as const,
      trackTitle: queueItem.track.title || queueItem.title || "Track",
    }
  }

  /**
   * App-controlled: resume Spotify playback (unpause). Room creator or room admin only.
   */
  async resumePlayback(roomId: string, userId: string) {
    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return { success: false as const, message: "Room not found" }
    }
    if (!isAppControlledPlayback(room)) {
      return {
        success: false as const,
        message: "This action is only available in app-controlled playback mode",
      }
    }

    const allowed = await isRoomAdmin({
      context: this.context,
      roomId,
      userId,
      roomCreator: room.creator,
    })
    if (!allowed) {
      return { success: false as const, message: "Not authorized to resume playback" }
    }

    const playbackController = await this.adapterService.getRoomPlaybackController(roomId)
    if (!playbackController) {
      return { success: false as const, message: "No playback controller configured for this room" }
    }

    try {
      await playbackController.api.play()
    } catch (e) {
      console.error("[DJService.resumePlayback] play failed:", e)
      return {
        success: false as const,
        message: "Failed to resume playback on Spotify",
      }
    }

    return { success: true as const }
  }
}
