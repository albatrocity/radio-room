import { AppContext, QueueItemAttribution } from "@repo/types"
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
 * Coerce a {@link QueueItemAttribution} into a `QueueItem.addedBy`-shaped value.
 *
 * Plugin attributions are stored under a sentinel `userId` of `plugin:<pluginName>`,
 * which is safe because all display code reads `addedBy?.username` only.
 */
function attributionToAddedBy(
  attr: QueueItemAttribution,
): { userId: string; username: string } {
  if (attr.type === "user") {
    return { userId: attr.userId, username: attr.username }
  }
  return {
    userId: `plugin:${attr.pluginName}`,
    username: attr.displayName ?? attr.pluginName,
  }
}

const APP_CONTROLLED_ONLY_MESSAGE =
  "Operation only available in app-controlled playback mode"

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
   * Add a song to the queue on behalf of a real user (socket handler entrypoint).
   * Runs plugin validation hooks (rate limiting, etc.).
   */
  async queueSong(
    roomId: string,
    userId: string,
    username: string,
    trackId: QueueItem["track"]["id"],
  ) {
    return this.queueSongAs(
      roomId,
      { type: "user", userId, username },
      trackId,
      { runPluginValidation: true },
    )
  }

  /**
   * Add a song to the queue with arbitrary attribution (user or plugin).
   *
   * Used by both the user-facing {@link queueSong} and `PluginAPI.addToTrackQueue`.
   * `runPluginValidation` defaults to `false` so plugin-initiated adds don't get
   * blocked by other plugins' `validateQueueRequest` hooks.
   */
  async queueSongAs(
    roomId: string,
    attribution: QueueItemAttribution,
    metadataTrackId: QueueItem["track"]["id"],
    options?: { runPluginValidation?: boolean },
  ) {
    const addedBy = attributionToAddedBy(attribution)
    const runValidation = options?.runPluginValidation ?? false

    const queue = await getQueue({ context: this.context, roomId })

    const inQueue = queue.find((x) => x.track.id === metadataTrackId)

    if (inQueue) {
      const existingAttributedToSameUser =
        attribution.type === "user" && inQueue.addedBy?.userId === attribution.userId

      const djUsername =
        (await getUser({ context: this.context, userId: inQueue.addedBy?.userId! }))?.username ??
        inQueue.addedBy?.username ??
        "Someone"

      return {
        success: false as const,
        message: existingAttributedToSameUser
          ? "You've already queued that song, please choose another"
          : `${djUsername} has already queued that song. Please try a different song.`,
      }
    }

    if (runValidation && this.context.pluginRegistry) {
      const validationResult = await this.context.pluginRegistry.validateQueueRequest({
        roomId,
        userId: addedBy.userId,
        username: addedBy.username,
        trackId: metadataTrackId,
      })

      if (!validationResult.allowed) {
        return {
          success: false as const,
          message: validationResult.reason ?? "Queue request was rejected",
        }
      }
    }

    const room = await findRoom({ context: this.context, roomId })

    if (!room) {
      return { success: false as const, message: "Room not found" }
    }

    const playbackController = await this.adapterService.getRoomPlaybackController(roomId)

    if (!playbackController) {
      return {
        success: false as const,
        message: "No playback controller configured for this room",
      }
    }

    const metadataSource = await this.adapterService.getUserMetadataSource(roomId, room.creator)

    if (!metadataSource) {
      return {
        success: false as const,
        message: "No metadata source configured for this room",
      }
    }

    let track: MetadataSourceTrack | null

    try {
      track = await metadataSource.api.findById(metadataTrackId)
      if (!track) {
        return { success: false as const, message: "Track not found" }
      }
    } catch (error) {
      return {
        success: false as const,
        message: "Failed to fetch track information",
        error,
      }
    }

    const resourceUrl = track.urls.find((url) => url.type === "resource")?.url
    if (!resourceUrl) {
      return { success: false as const, message: "Track resource URL not found" }
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
      addedBy,
      addedAt: Date.now(),
      addedDuring: undefined,
      playedAt: undefined,
    })

    await addToQueue({ context: this.context, roomId, item: queuedItem })

    // Spotify-native queue (default). App-controlled: Redis-only queue; advance job / explicit Play start Spotify.
    if (!isAppControlledPlayback(room)) {
      try {
        await playbackController.api.addToQueue(resourceUrl)
      } catch (error) {
        console.error("Failed to add to playback queue:", error)
        const trackKey = canonicalQueueTrackKey(queuedItem)
        await removeFromQueue({ context: this.context, roomId, trackId: trackKey })
        return {
          success: false as const,
          message: "Failed to add track to playback queue",
          error,
        }
      }
    }

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
      success: true as const,
      queuedItem,
      systemMessage: systemMessage(`${addedBy.username || "Someone"} added a song to the queue`),
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

  /**
   * Emit `QUEUE_CHANGED` for an app-controlled room. Includes the dispatched-but-not-yet-on-air
   * head row so clients see the same shape as `getQueueWithDispatched`.
   */
  private async emitQueueChanged(roomId: string): Promise<void> {
    if (!this.context.systemEvents) return
    const queue = await getQueueWithDispatched({ context: this.context, roomId })
    await this.context.systemEvents.emit(roomId, "QUEUE_CHANGED", { roomId, queue })
  }

  /**
   * Resolve room and ensure it is in app-controlled playback mode.
   * Returns the room when allowed, or a `{ success: false, message }` result otherwise.
   */
  private async requireAppControlledRoom(roomId: string) {
    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      return { ok: false as const, error: { success: false as const, message: "Room not found" } }
    }
    if (!isAppControlledPlayback(room)) {
      return {
        ok: false as const,
        error: { success: false as const, message: APP_CONTROLLED_ONLY_MESSAGE },
      }
    }
    return { ok: true as const, room }
  }

  /**
   * App-controlled only: remove a track from the Redis-backed queue.
   * Plugins are trusted callers; no per-user authorization check is performed here.
   */
  async removeTrackFromQueue(roomId: string, metadataTrackId: QueueItem["track"]["id"]) {
    const guard = await this.requireAppControlledRoom(roomId)
    if (!guard.ok) return guard.error

    const queue = await getQueue({ context: this.context, roomId })
    const item = queue.find((q) => q.track.id === metadataTrackId)
    if (!item) {
      return { success: false as const, message: "Track not found in queue" }
    }

    const queueKey = canonicalQueueTrackKey(item)
    await removeFromQueue({ context: this.context, roomId, trackId: queueKey })
    await this.emitQueueChanged(roomId)
    return { success: true as const }
  }

  /**
   * App-controlled only: move a track to the head of the queue.
   */
  async moveTrackToQueueTop(roomId: string, metadataTrackId: QueueItem["track"]["id"]) {
    return this.moveTrackTo(roomId, metadataTrackId, "top")
  }

  /**
   * App-controlled only: move a track to the tail of the queue.
   */
  async moveTrackToQueueBottom(roomId: string, metadataTrackId: QueueItem["track"]["id"]) {
    return this.moveTrackTo(roomId, metadataTrackId, "bottom")
  }

  /**
   * App-controlled only: move a track forward or backward in the queue by `delta` slots.
   * Negative delta promotes (toward index 0); positive delta demotes (toward the tail).
   */
  async moveTrackByPosition(
    roomId: string,
    metadataTrackId: QueueItem["track"]["id"],
    delta: number,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const guard = await this.requireAppControlledRoom(roomId)
    if (!guard.ok) return guard.error

    if (!Number.isFinite(delta) || delta === 0) {
      return { success: false as const, message: "Invalid queue move delta" }
    }

    const queue = await getQueue({ context: this.context, roomId })
    const index = queue.findIndex((q) => q.track.id === metadataTrackId)
    if (index === -1) {
      return { success: false as const, message: "Track not found in queue" }
    }

    if (queue.length === 0) {
      return { success: false as const, message: "Queue is empty" }
    }
    if (queue.length === 1) {
      return { success: false as const, message: "Not enough tracks in the queue to reorder" }
    }

    const finalIndex = Math.max(0, Math.min(queue.length - 1, index + delta))
    if (finalIndex === index) {
      return {
        success: false as const,
        message: "Track can't move further in that direction",
      }
    }

    const reordered = [...queue]
    const [target] = reordered.splice(index, 1)
    if (!target) {
      return { success: false as const, message: "Track not found in queue" }
    }
    reordered.splice(finalIndex, 0, target)

    await setQueue({ roomId, items: reordered, context: this.context })
    await this.emitQueueChanged(roomId)
    return { success: true as const }
  }

  private async moveTrackTo(
    roomId: string,
    metadataTrackId: QueueItem["track"]["id"],
    edge: "top" | "bottom",
  ) {
    const guard = await this.requireAppControlledRoom(roomId)
    if (!guard.ok) return guard.error

    const queue = await getQueue({ context: this.context, roomId })
    const index = queue.findIndex((q) => q.track.id === metadataTrackId)
    if (index === -1) {
      return { success: false as const, message: "Track not found in queue" }
    }

    if (queue.length <= 1) {
      // Already at both top and bottom; no-op success.
      return { success: true as const }
    }

    const reordered = [...queue]
    const [target] = reordered.splice(index, 1)
    if (!target) {
      return { success: false as const, message: "Track not found in queue" }
    }
    if (edge === "top") {
      reordered.unshift(target)
    } else {
      reordered.push(target)
    }

    await setQueue({ roomId, items: reordered, context: this.context })
    await this.emitQueueChanged(roomId)
    return { success: true as const }
  }

  /**
   * App-controlled only: shuffle the queue (Fisher–Yates). Empty/single-item queues are no-ops.
   */
  async shuffleQueue(roomId: string) {
    const guard = await this.requireAppControlledRoom(roomId)
    if (!guard.ok) return guard.error

    const queue = await getQueue({ context: this.context, roomId })
    if (queue.length <= 1) {
      return { success: true as const }
    }

    const shuffled = [...queue]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!]
    }

    await setQueue({ roomId, items: shuffled, context: this.context })
    await this.emitQueueChanged(roomId)
    return { success: true as const }
  }
}
