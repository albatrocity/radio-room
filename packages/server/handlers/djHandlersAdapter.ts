import { DJService } from "../services/DJService"
import { MediaBridgeService } from "../services/MediaBridgeService"
import {
  QueueItem,
  HandlerConnections,
  AppContext,
  User,
  isDeferredQueueRequest,
} from "@repo/types"
import sendMessage from "../lib/sendMessage"
import { pubUserJoined } from "../operations/sockets/users"
import { AdapterService } from "../services/AdapterService"
import {
  browseAlbum as browseAlbumOp,
  browseAlbums as browseAlbumsOp,
  browseArtist as browseArtistOp,
  browseArtists as browseArtistsOp,
  browseMediaItem as browseMediaItemOp,
  getEffectiveMetadataSources as getEffectiveMetadataSourcesOp,
} from "../operations/dj/browseCatalog"
import { searchTracksAcrossSources } from "../operations/dj/searchTracks"

/**
 * Socket.io adapter for the DJService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class DJHandlers {
  private readonly adapterService: AdapterService
  private readonly mediaBridgeService: MediaBridgeService

  constructor(
    private readonly djService: DJService,
    private readonly context: AppContext,
  ) {
    this.adapterService = new AdapterService(context)
    this.mediaBridgeService = new MediaBridgeService(context)
  }

  /**
   * Deputize or undeputize a user as a DJ
   */
  djDeputizeUser = async ({ io, socket }: HandlerConnections, userId: User["userId"]) => {
    const { context } = socket

    const result = await this.djService.deputizeUser(socket.data.roomId, userId)

    if (result.socketId) {
      io.to(result.socketId).emit(
        "event",
        {
          type: "MESSAGE_RECEIVED",
          data: {
            roomId: socket.data.roomId,
            message: result.systemMessage,
          },
        },
        { status: "info" },
      )

      io.to(result.socketId).emit("event", { type: result.eventType })
    }

    if (result.user) {
      pubUserJoined({
        io,
        roomId: socket.data.roomId,
        data: { user: result.user, users: result.users },
        context,
      })
    }
  }

  /**
   * Add a song to the queue
   */
  queueSong = async (
    { socket, io }: HandlerConnections,
    payload: QueueItem["track"]["id"] | { trackId: string; source?: string },
  ) => {
    try {
      const { userId, username, roomId } = socket.data
      const trackId = typeof payload === "string" ? payload : payload.trackId
      const mediaSourceType = typeof payload === "string" ? undefined : payload.source

      const result = await this.djService.queueSong(
        roomId,
        userId,
        username,
        trackId,
        mediaSourceType,
      )

      if (!result.success) {
        socket.emit("event", {
          type: "SONG_QUEUE_FAILURE",
          data: {
            message: result.message,
          },
        })
        return
      }

      if (isDeferredQueueRequest(result)) {
        socket.emit("event", {
          type: "SONG_QUEUE_HELD",
          data: {
            message: result.message,
          },
        })
        return
      }

      socket.emit("event", {
        type: "SONG_QUEUED",
        data: result.queuedItem,
      })

      if (result.systemMessage) {
        sendMessage(io, roomId, result.systemMessage, this.context)
      }
    } catch (e) {
      console.error("Error queueing song:", e)
      socket.emit("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message: "Song could not be queued",
          error: e,
        },
      })
    }
  }

  /**
   * Check if tracks are saved in user's library
   * @param payload - Object containing trackIds and optional targetService
   */
  checkSavedTracks = async (
    { socket }: HandlerConnections,
    payload: { trackIds: string[]; targetService?: string },
  ) => {
    const { trackIds, targetService } = payload
    console.log("[checkSavedTracks] Called with:", { trackIds, targetService })
    try {
      const { roomId, userId } = socket.data
      console.log("[checkSavedTracks] roomId:", roomId, "userId:", userId)

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        // Return empty results for invalid input
        socket.emit("event", {
          type: "CHECK_SAVED_TRACKS_RESULTS",
          data: { results: [], trackIds: [] },
        })
        return
      }

      // Get the metadata source - use specific service if provided, otherwise use primary
      const metadataSource = targetService
        ? await this.adapterService.getMetadataSourceForUser(roomId, userId, targetService)
        : await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.checkSavedTracks) {
        // Service doesn't support library - return all false gracefully
        const results = trackIds.map(() => false)
        socket.emit("event", {
          type: "CHECK_SAVED_TRACKS_RESULTS",
          data: { results, trackIds },
        })
        return
      }

      const results = await metadataSource.api.checkSavedTracks(trackIds)

      socket.emit("event", {
        type: "CHECK_SAVED_TRACKS_RESULTS",
        data: { results, trackIds },
      })
    } catch (error: any) {
      console.error("Error checking saved tracks:", error)
      socket.emit("event", {
        type: "CHECK_SAVED_TRACKS_FAILURE",
        data: { message: error?.message || "Failed to check saved tracks" },
      })
    }
  }

  /**
   * Add tracks to user's library
   * @param payload - Object containing trackIds and optional targetService
   */
  addToLibrary = async (
    { socket }: HandlerConnections,
    payload: { trackIds: string[]; targetService?: string },
  ) => {
    const { trackIds, targetService } = payload
    console.log("[addToLibrary] Called with:", { trackIds, targetService })
    try {
      const { roomId, userId } = socket.data
      console.log("[addToLibrary] roomId:", roomId, "userId:", userId)

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        socket.emit("event", {
          type: "ADD_TO_LIBRARY_FAILURE",
          data: { message: "No tracks specified" },
        })
        return
      }

      // Get the metadata source - use specific service if provided, otherwise use primary
      const metadataSource = targetService
        ? await this.adapterService.getMetadataSourceForUser(roomId, userId, targetService)
        : await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.addToLibrary) {
        socket.emit("event", {
          type: "ADD_TO_LIBRARY_FAILURE",
          data: { message: "Please connect a music service to add tracks to your library" },
        })
        return
      }

      await metadataSource.api.addToLibrary(trackIds)

      socket.emit("event", {
        type: "ADD_TO_LIBRARY_SUCCESS",
        data: { trackIds },
      })
    } catch (error: any) {
      console.error("Error adding to library:", error)
      socket.emit("event", {
        type: "ADD_TO_LIBRARY_FAILURE",
        data: { message: error?.message || "Failed to add to library" },
      })
    }
  }

  /**
   * Remove tracks from user's library
   * @param payload - Object containing trackIds and optional targetService
   */
  removeFromLibrary = async (
    { socket }: HandlerConnections,
    payload: { trackIds: string[]; targetService?: string },
  ) => {
    const { trackIds, targetService } = payload
    try {
      const { roomId, userId } = socket.data

      if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
        socket.emit("event", {
          type: "REMOVE_FROM_LIBRARY_FAILURE",
          data: { message: "No tracks specified" },
        })
        return
      }

      // Get the metadata source - use specific service if provided, otherwise use primary
      const metadataSource = targetService
        ? await this.adapterService.getMetadataSourceForUser(roomId, userId, targetService)
        : await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.removeFromLibrary) {
        socket.emit("event", {
          type: "REMOVE_FROM_LIBRARY_FAILURE",
          data: { message: "Please connect a music service to manage your library" },
        })
        return
      }

      await metadataSource.api.removeFromLibrary(trackIds)

      socket.emit("event", {
        type: "REMOVE_FROM_LIBRARY_SUCCESS",
        data: { trackIds },
      })
    } catch (error: any) {
      console.error("Error removing from library:", error)
      socket.emit("event", {
        type: "REMOVE_FROM_LIBRARY_FAILURE",
        data: { message: error?.message || "Failed to remove from library" },
      })
    }
  }

  /**
   * Return per-user effective metadata source ids for search UI tabs (ADR 0088)
   * and browseableSourceIds for catalog browse (ADR 0089).
   */
  getEffectiveMetadataSources = async ({ socket }: HandlerConnections) => {
    const { roomId, userId } = socket.data
    const data = await getEffectiveMetadataSourcesOp({
      context: this.context,
      adapterService: this.adapterService,
      roomId,
      userId,
    })
    socket.emit("event", {
      type: "EFFECTIVE_METADATA_SOURCES",
      data,
    })
  }

  /**
   * Admin-only: list Navidrome playlists from the connected Media Bridge (shelf config picker).
   */
  listBridgeLocalPlaylists = async ({ socket }: HandlerConnections) => {
    const { roomId, userId } = socket.data
    try {
      const { findRoom, isRoomAdmin } = await import("../operations/data")
      const room = await findRoom({ context: this.context, roomId })
      if (!room) {
        socket.emit("event", { type: "BRIDGE_LOCAL_PLAYLISTS", data: { playlists: [] } })
        return
      }
      const admin = await isRoomAdmin({
        context: this.context,
        roomId,
        userId,
        roomCreator: room.creator,
      })
      if (!admin) {
        socket.emit("event", { type: "BRIDGE_LOCAL_PLAYLISTS", data: { playlists: [] } })
        return
      }
      const { getBridgeRpcClient, listLocalPlaylists } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      const playlists = rpc ? await listLocalPlaylists({ rpc }) : []
      socket.emit("event", {
        type: "BRIDGE_LOCAL_PLAYLISTS",
        data: { playlists },
      })
    } catch (e) {
      console.warn("[listBridgeLocalPlaylists] failed:", e)
      socket.emit("event", { type: "BRIDGE_LOCAL_PLAYLISTS", data: { playlists: [] } })
    }
  }

  browseArtists = async (
    { socket }: HandlerConnections,
    payload: { source: string; query?: string; offset?: number; limit?: number },
  ) => {
    const { roomId, userId } = socket.data
    const result = await browseArtistsOp({
      context: this.context,
      adapterService: this.adapterService,
      roomId,
      userId,
      ...payload,
    })
    if (!result.ok) {
      socket.emit("event", {
        type: "BROWSE_ARTISTS_FAILURE",
        data: {
          message: result.message,
          ...(result.authFailure
            ? { status: result.authFailure.status, source: result.authFailure.source }
            : {}),
        },
      })
      return
    }
    socket.emit("event", {
      type: "BROWSE_ARTISTS_RESULTS",
      data: {
        source: result.source,
        items: result.items,
        total: result.total,
      },
    })
  }

  browseAlbums = async (
    { socket }: HandlerConnections,
    payload: { source: string; query?: string; offset?: number; limit?: number },
  ) => {
    const { roomId, userId } = socket.data
    const result = await browseAlbumsOp({
      context: this.context,
      adapterService: this.adapterService,
      roomId,
      userId,
      ...payload,
    })
    if (!result.ok) {
      socket.emit("event", {
        type: "BROWSE_ALBUMS_FAILURE",
        data: {
          message: result.message,
          ...(result.authFailure
            ? { status: result.authFailure.status, source: result.authFailure.source }
            : {}),
        },
      })
      return
    }
    socket.emit("event", {
      type: "BROWSE_ALBUMS_RESULTS",
      data: {
        source: result.source,
        items: result.items,
        total: result.total,
      },
    })
  }

  browseArtist = async (
    { socket }: HandlerConnections,
    payload: { source: string; artistId: string },
  ) => {
    const { roomId, userId } = socket.data
    const result = await browseArtistOp({
      context: this.context,
      adapterService: this.adapterService,
      roomId,
      userId,
      ...payload,
    })
    if (!result.ok) {
      socket.emit("event", {
        type: "BROWSE_ARTIST_FAILURE",
        data: {
          message: result.message,
          ...(result.authFailure
            ? { status: result.authFailure.status, source: result.authFailure.source }
            : {}),
        },
      })
      return
    }
    socket.emit("event", {
      type: "BROWSE_ARTIST_RESULTS",
      data: {
        source: result.source,
        artist: result.artist,
        albums: result.albums,
      },
    })
  }

  browseAlbum = async (
    { socket }: HandlerConnections,
    payload: { source: string; albumId: string },
  ) => {
    const { roomId, userId } = socket.data
    const result = await browseAlbumOp({
      context: this.context,
      adapterService: this.adapterService,
      roomId,
      userId,
      ...payload,
    })
    if (!result.ok) {
      socket.emit("event", {
        type: "BROWSE_ALBUM_FAILURE",
        data: {
          message: result.message,
          ...(result.authFailure
            ? { status: result.authFailure.status, source: result.authFailure.source }
            : {}),
        },
      })
      return
    }
    socket.emit("event", {
      type: "BROWSE_ALBUM_RESULTS",
      data: {
        source: result.source,
        album: result.album,
        tracks: result.tracks,
      },
    })
  }

  /**
   * Browse tracks on a held Physical Media item. `mediaKey` is resolved from
   * the caller's inventory grants — never a client-supplied playlist id (ADR 0099).
   */
  browseMediaItem = async (
    { socket }: HandlerConnections,
    payload: { mediaKey: string },
  ) => {
    const { roomId, userId } = socket.data
    const result = await browseMediaItemOp({
      context: this.context,
      roomId,
      userId,
      mediaKey: payload.mediaKey,
    })
    if (!result.ok) {
      socket.emit("event", {
        type: "BROWSE_MEDIA_ITEM_FAILURE",
        data: { message: result.message },
      })
      return
    }
    socket.emit("event", {
      type: "BROWSE_MEDIA_ITEM_RESULTS",
      data: {
        source: result.source,
        mediaKey: result.mediaKey,
        name: result.name,
        tracks: result.tracks,
      },
    })
  }

  /**
   * Search for tracks across all room metadata sources (fan-out).
   * Bridge rooms apply cross-source dedup by mediaSourcePriority.
   */
  searchForTrack = async ({ socket }: HandlerConnections, { query }: { query: string }) => {
    const { roomId, userId } = socket.data
    const result = await searchTracksAcrossSources({
      context: this.context,
      adapterService: this.adapterService,
      roomId,
      userId,
      query,
      searchSource: (src, q, options) => this.djService.searchForTrack(src, q, options),
    })

    if (!result.success) {
      socket.emit("event", {
        type: "TRACK_SEARCH_RESULTS_FAILURE",
        data: { message: result.message },
      })
      return
    }

    socket.emit("event", {
      type: "TRACK_SEARCH_RESULTS",
      data: {
        items: result.items,
        total: result.total,
        offset: result.offset,
        limit: result.limit,
        artists: result.artists,
        albums: result.albums,
        ...(result.authErrors ? { authErrors: result.authErrors } : {}),
      },
    })
  }

  /**
   * Save a playlist to a metadata source
   *
   * @param targetService - Optional service to save to (e.g., "spotify", "tidal")
   *                        If not provided, uses the room's primary metadata source
   * @param roomId - Optional room ID from client (preferred over socket.data)
   */
  savePlaylist = async (
    { socket }: HandlerConnections,
    {
      name,
      trackIds,
      targetService,
      roomId: clientRoomId,
    }: {
      name: string
      trackIds: QueueItem["track"]["id"][]
      targetService?: string
      roomId?: string
    },
  ) => {
    try {
      // Get roomId and userId - prefer client-provided roomId, then socket.data, then session
      const roomId = clientRoomId ?? socket.data.roomId ?? socket.request?.session?.roomId
      const userId = socket.data.userId ?? socket.request?.session?.user?.userId

      console.log("[savePlaylist] Received request:", {
        roomId,
        userId,
        name,
        trackIds: trackIds.length,
        targetService,
      })

      if (!roomId || !userId) {
        console.log("[savePlaylist] Missing roomId or userId")
        socket.emit("event", {
          type: "SAVE_PLAYLIST_FAILED",
          error: { message: "You must be in a room to save a playlist" },
        })
        return
      }

      // Get the metadata source - either the specified one or the user's default
      let metadataSource
      if (targetService) {
        // Get the specific metadata source
        metadataSource = await this.adapterService.getMetadataSourceForUser(
          roomId,
          userId,
          targetService,
        )
      } else {
        // Get the user's primary metadata source
        metadataSource = await this.adapterService.getUserMetadataSource(roomId, userId)
      }

      if (!metadataSource) {
        console.log("[savePlaylist] No metadata source found for:", targetService || "primary")
        socket.emit("event", {
          type: "SAVE_PLAYLIST_FAILED",
          error: {
            message: `${targetService || "Metadata source"} is not configured for this room`,
          },
        })
        return
      }

      console.log("[savePlaylist] Using metadata source:", metadataSource.name)
      console.log("[savePlaylist] Calling DJService.savePlaylist")
      const result = await this.djService.savePlaylist(metadataSource, userId, name, trackIds)

      console.log("[savePlaylist] Result:", result)

      if (result.success) {
        socket.emit("event", { type: "PLAYLIST_SAVED", data: result.data })
      } else {
        socket.emit("event", {
          type: "SAVE_PLAYLIST_FAILED",
          error: { message: result.error?.message || String(result.error) },
        })
      }
    } catch (error: any) {
      console.error("[savePlaylist] Error:", error)
      socket.emit("event", {
        type: "SAVE_PLAYLIST_FAILED",
        error: { message: error?.message || "Failed to save playlist" },
      })
    }
  }

  /**
   * Handle a user joining, automatically deputizing them if needed
   */
  handleUserJoined = async (
    { io, socket }: HandlerConnections,
    { user }: { user: User; users: User[] },
  ) => {
    const result = await this.djService.handleUserJoined(socket.data.roomId, user)

    if (result.shouldDeputize && result.userId) {
      this.djDeputizeUser({ io, socket }, result.userId)
    }
  }

  /**
   * Get saved tracks for the current user
   */
  getSavedTracks = async ({ socket }: HandlerConnections) => {
    try {
      const { roomId, userId } = socket.data

      const metadataSource = await this.adapterService.getUserMetadataSource(roomId, userId)

      if (!metadataSource?.api?.getSavedTracks) {
        // Silently return empty array if not supported
        socket.emit("event", {
          type: "SAVED_TRACKS_RESULTS",
          data: [],
        })
        return
      }

      const savedTracks = await metadataSource.api.getSavedTracks()

      socket.emit("event", {
        type: "SAVED_TRACKS_RESULTS",
        data: savedTracks,
      })
    } catch (error: any) {
      console.error("Error fetching saved tracks:", error)
      socket.emit("event", {
        type: "SAVED_TRACKS_RESULTS_FAILURE",
        error: error?.message || "Failed to fetch saved tracks",
      })
    }
  }

  /**
   * Request removal of a track from the queue
   * Sends a system message to the room notifying the admin
   */
  requestQueueRemoval = async (
    { socket, io }: HandlerConnections,
    { trackId }: { trackId: string },
  ) => {
    try {
      const { roomId, userId, username } = socket.data

      // Get the queue to find the track
      const { getQueue, findRoom, getUser } = await import("../operations/data")
      const queue = await getQueue({ context: this.context, roomId })

      // Find the track in the queue
      const queueItem = queue.find((item) => item.track.id === trackId)

      if (!queueItem) {
        socket.emit("event", {
          type: "REQUEST_QUEUE_REMOVAL_FAILURE",
          data: { message: "Track not found in queue" },
        })
        return
      }

      // Verify the user added this track
      if (queueItem.addedBy?.userId !== userId) {
        socket.emit("event", {
          type: "REQUEST_QUEUE_REMOVAL_FAILURE",
          data: { message: "You can only request removal of tracks you added" },
        })
        return
      }

      // Get room to find the creator
      const room = await findRoom({ context: this.context, roomId })
      const creator = room?.creator
        ? await getUser({ context: this.context, userId: room.creator })
        : null
      const creatorMention = creator?.username ? `@${creator.username}` : "Room admin"

      // Get the actual track title from track.track.title
      const trackTitle = queueItem.track.title || queueItem.title || "Unknown track"

      // Send a system message to the room mentioning the admin
      const { default: systemMessage } = await import("../lib/systemMessage")
      const message = systemMessage(
        `{creatorMention}: ${username} requested removal of "${trackTitle}" from the queue.`,
        { status: "info" },
        creator?.username ? [creator.username] : undefined,
      )

      await sendMessage(io, roomId, message, this.context)

      socket.emit("event", {
        type: "REQUEST_QUEUE_REMOVAL_SUCCESS",
        data: { trackId },
      })
    } catch (error: any) {
      console.error("Error requesting queue removal:", error)
      socket.emit("event", {
        type: "REQUEST_QUEUE_REMOVAL_FAILURE",
        data: { message: error?.message || "Failed to request queue removal" },
      })
    }
  }

  /**
   * Remove a track from the Redis queue when the room uses app-controlled playback.
   */
  removeFromQueueDirect = async (
    { socket }: HandlerConnections,
    { trackId }: { trackId: string },
  ) => {
    try {
      const { roomId, userId } = socket.data

      const result = await this.djService.removeFromQueueDirect(roomId, userId, trackId)

      if (!result.success) {
        socket.emit("event", {
          type: "REMOVE_FROM_QUEUE_FAILURE",
          data: { message: result.message, trackId },
        })
        return
      }

      socket.emit("event", {
        type: "REMOVE_FROM_QUEUE_SUCCESS",
        data: { trackId, trackTitle: result.trackTitle },
      })
    } catch (error: any) {
      console.error("Error removing from queue:", error)
      socket.emit("event", {
        type: "REMOVE_FROM_QUEUE_FAILURE",
        data: {
          message: error?.message || "Failed to remove track from queue",
          trackId,
        },
      })
    }
  }

  reorderQueue = async (
    { socket }: HandlerConnections,
    { orderedKeys }: { orderedKeys: string[] },
  ) => {
    try {
      const { roomId, userId } = socket.data
      if (!Array.isArray(orderedKeys)) {
        socket.emit("event", {
          type: "REORDER_QUEUE_FAILURE",
          data: { message: "Invalid payload" },
        })
        return
      }
      const result = await this.djService.reorderQueue(roomId, userId, orderedKeys)
      if (!result.success) {
        socket.emit("event", {
          type: "REORDER_QUEUE_FAILURE",
          data: { message: result.message },
        })
        return
      }
      socket.emit("event", { type: "REORDER_QUEUE_SUCCESS" })
    } catch (error: any) {
      console.error("Error reordering queue:", error)
      socket.emit("event", {
        type: "REORDER_QUEUE_FAILURE",
        data: { message: error?.message || "Failed to reorder queue" },
      })
    }
  }

  setQueueSplit = async (
    { socket }: HandlerConnections,
    { belowKey }: { belowKey: string },
  ) => {
    try {
      const { roomId, userId } = socket.data
      if (typeof belowKey !== "string" || belowKey.length === 0) {
        socket.emit("event", {
          type: "SET_QUEUE_SPLIT_FAILURE",
          data: { message: "Invalid payload" },
        })
        return
      }
      const result = await this.djService.setQueueSplit(roomId, userId, belowKey)
      if (!result.success) {
        socket.emit("event", {
          type: "SET_QUEUE_SPLIT_FAILURE",
          data: { message: result.message },
        })
        return
      }
      socket.emit("event", { type: "SET_QUEUE_SPLIT_SUCCESS" })
    } catch (error: any) {
      console.error("Error setting queue split:", error)
      socket.emit("event", {
        type: "SET_QUEUE_SPLIT_FAILURE",
        data: { message: error?.message || "Failed to set queue split" },
      })
    }
  }

  removeQueueSplit = async ({ socket }: HandlerConnections) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.djService.removeQueueSplit(roomId, userId)
      if (!result.success) {
        socket.emit("event", {
          type: "REMOVE_QUEUE_SPLIT_FAILURE",
          data: { message: result.message },
        })
        return
      }
      socket.emit("event", { type: "REMOVE_QUEUE_SPLIT_SUCCESS" })
    } catch (error: any) {
      console.error("Error removing queue split:", error)
      socket.emit("event", {
        type: "REMOVE_QUEUE_SPLIT_FAILURE",
        data: { message: error?.message || "Failed to remove queue split" },
      })
    }
  }

  playQueuedTrack = async ({ socket }: HandlerConnections, { trackId }: { trackId: string }) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.djService.playQueuedTrack(roomId, userId, trackId)

      if (!result.success) {
        socket.emit("event", {
          type: "PLAY_QUEUED_TRACK_FAILURE",
          data: { message: result.message, trackId },
        })
        return
      }

      socket.emit("event", {
        type: "PLAY_QUEUED_TRACK_SUCCESS",
        data: { trackId, trackTitle: result.trackTitle },
      })
    } catch (error: any) {
      console.error("Error playing queued track:", error)
      socket.emit("event", {
        type: "PLAY_QUEUED_TRACK_FAILURE",
        data: {
          message: error?.message || "Failed to play track from queue",
          trackId,
        },
      })
    }
  }

  togglePlayback = async ({ socket }: HandlerConnections) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.djService.togglePlayback(roomId, userId)

      if (!result.success) {
        socket.emit("event", {
          type: "TOGGLE_PLAYBACK_FAILURE",
          data: { message: result.message },
        })
        return
      }

      socket.emit("event", {
        type: "TOGGLE_PLAYBACK_SUCCESS",
        data: {
          state: result.state,
          action: result.action,
          trackTitle: "trackTitle" in result ? result.trackTitle : undefined,
          canResume: "canResume" in result ? result.canResume : undefined,
        },
      })
    } catch (error: any) {
      console.error("Error toggling playback:", error)
      socket.emit("event", {
        type: "TOGGLE_PLAYBACK_FAILURE",
        data: { message: error?.message || "Failed to control playback" },
      })
    }
  }

  getPlaybackState = async ({ socket }: HandlerConnections) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.djService.getPlaybackState(roomId, userId)

      if (!result.success) {
        socket.emit("event", {
          type: "GET_PLAYBACK_STATE_FAILURE",
          data: { message: result.message },
        })
        return
      }

      socket.emit("event", {
        type: "PLAYBACK_STATE",
        data: {
          state: result.state,
          trackId: result.trackId,
          canResume: result.canResume,
          progressMs: result.progressMs,
          durationMs: result.durationMs,
          volumePercent: result.volumePercent,
          supportsVolume: result.supportsVolume,
        },
      })
    } catch (error: any) {
      console.error("Error reading playback state:", error)
      socket.emit("event", {
        type: "GET_PLAYBACK_STATE_FAILURE",
        data: { message: error?.message || "Failed to read playback state" },
      })
    }
  }

  seekPlayback = async (
    { socket }: HandlerConnections,
    { positionMs }: { positionMs: number },
  ) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.djService.seekPlayback(roomId, userId, positionMs)

      if (!result.success) {
        socket.emit("event", {
          type: "SEEK_PLAYBACK_FAILURE",
          data: { message: result.message },
        })
        return
      }

      socket.emit("event", {
        type: "SEEK_PLAYBACK_SUCCESS",
        data: { positionMs: result.positionMs },
      })
    } catch (error: any) {
      console.error("Error seeking playback:", error)
      socket.emit("event", {
        type: "SEEK_PLAYBACK_FAILURE",
        data: { message: error?.message || "Failed to seek playback" },
      })
    }
  }

  setPlaybackVolume = async (
    { socket }: HandlerConnections,
    { volumePercent }: { volumePercent: number },
  ) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.djService.setPlaybackVolume(roomId, userId, volumePercent)

      if (!result.success) {
        socket.emit("event", {
          type: "SET_PLAYBACK_VOLUME_FAILURE",
          data: { message: result.message },
        })
        return
      }

      socket.emit("event", {
        type: "SET_PLAYBACK_VOLUME_SUCCESS",
        data: { volumePercent: result.volumePercent },
      })
    } catch (error: any) {
      console.error("Error setting playback volume:", error)
      socket.emit("event", {
        type: "SET_PLAYBACK_VOLUME_FAILURE",
        data: { message: error?.message || "Failed to set playback volume" },
      })
    }
  }

  linkMediaBridge = async ({ socket }: HandlerConnections) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.mediaBridgeService.linkMediaBridge(roomId, userId)

      if (!result.success) {
        socket.emit("event", {
          type: "LINK_MEDIA_BRIDGE_FAILURE",
          data: { message: result.message },
        })
        return
      }

      socket.emit("event", {
        type: "LINK_MEDIA_BRIDGE_SUCCESS",
        data: { daemonId: result.daemonId, roomId: result.roomId },
      })
    } catch (error: any) {
      console.error("Error linking Media Bridge:", error)
      socket.emit("event", {
        type: "LINK_MEDIA_BRIDGE_FAILURE",
        data: { message: error?.message || "Failed to link Media Bridge" },
      })
    }
  }

  getMediaBridgeStatus = async ({ socket }: HandlerConnections) => {
    try {
      const { roomId, userId } = socket.data
      const result = await this.mediaBridgeService.getMediaBridgeStatus(roomId, userId)

      if (!result.success) {
        socket.emit("event", {
          type: "MEDIA_BRIDGE_STATUS_CHANGED",
          data: { roomId, connected: false, message: result.message },
        })
        return
      }

      socket.emit("event", {
        type: "MEDIA_BRIDGE_STATUS_CHANGED",
        data: {
          roomId: result.roomId,
          connected: result.connected,
          services: "services" in result ? result.services : undefined,
        },
      })
    } catch (error: any) {
      console.error("Error getting Media Bridge status:", error)
      socket.emit("event", {
        type: "MEDIA_BRIDGE_STATUS_CHANGED",
        data: {
          roomId: socket.data.roomId,
          connected: false,
          message: error?.message || "Failed to get Media Bridge status",
        },
      })
    }
  }
}

/**
 * Factory function to create DJ handlers
 */
export function createDJHandlers(context: AppContext) {
  const djService = new DJService(context)
  return new DJHandlers(djService, context)
}
