import { Request, Response } from "express"
import { Server } from "socket.io"
import { createRoomId, withDefaults } from "../operations/createRoom"
import {
  findRoom as findRoomData,
  deleteRoom as deleteRoomData,
  saveRoom,
  parseRoom,
  removeSensitiveRoomAttributes,
  getUserRooms,
  getAllRooms,
  getUserServiceAuth,
  getRoomOnlineUsers,
  getRoomCurrent,
  getUser,
} from "../operations/data"
import { checkUserChallenge } from "../operations/userChallenge"
import { RoomSnapshot } from "@repo/types/Room"
import { SocketWithContext } from "../lib/socketWithContext"
import { createRoomHandlers } from "../handlers/roomHandlersAdapter"
import { AppContext } from "@repo/types"

/**
 * Get available metadata sources for a user based on their linked services
 * Always includes "spotify", adds "tidal" if user has it linked
 */
async function getAvailableMetadataSourcesForUser(
  context: AppContext,
  userId: string,
): Promise<string[]> {
  const sources: string[] = ["spotify"] // Spotify is always available as default

  // Check if user has Tidal linked
  try {
    const tidalAuth = await getUserServiceAuth({ context, userId, serviceName: "tidal" })
    if (tidalAuth?.accessToken) {
      sources.push("tidal")
    }
  } catch {
    // Tidal not linked, that's fine
  }

  return sources
}

function configureAdaptersForRoomType(params: {
  type: "jukebox" | "radio"
  playbackControllerId?: string
  metadataSourceIds?: string[]
  mediaSourceId?: string
  mediaSourceConfig?: any
  radioMetaUrl?: string
}) {
  const {
    type,
    playbackControllerId,
    metadataSourceIds,
    mediaSourceId,
    mediaSourceConfig,
    radioMetaUrl,
  } = params

  if (type === "jukebox") {
    return {
      playbackControllerId: playbackControllerId || "spotify",
      metadataSourceIds: metadataSourceIds, // Will be set by caller if not provided
      mediaSourceId: mediaSourceId || "spotify",
      mediaSourceConfig,
    }
  } else if (type === "radio") {
    return {
      playbackControllerId: playbackControllerId || "spotify",
      metadataSourceIds: metadataSourceIds, // Will be set by caller if not provided
      mediaSourceId: mediaSourceId || "shoutcast",
      mediaSourceConfig: mediaSourceConfig || (radioMetaUrl ? { url: radioMetaUrl } : undefined),
    }
  }

  // Default fallback
  return {
    playbackControllerId,
    metadataSourceIds,
    mediaSourceId,
    mediaSourceConfig,
  }
}

export async function create(req: Request, res: Response) {
  const {
    title,
    type,
    radioMetaUrl,
    radioListenUrl,
    challenge,
    userId,
    radioProtocol,
    deputizeOnJoin,
    playbackControllerId: requestedPlaybackControllerId,
    metadataSourceIds: requestedMetadataSourceIds,
    mediaSourceId: requestedMediaSourceId,
    mediaSourceConfig: requestedMediaSourceConfig,
  } = req.body
  const createdAt = Date.now().toString()
  console.log("radioListenUrl", radioListenUrl)

  const { context } = req

  try {
    await checkUserChallenge({ challenge, userId, context })
    const id = createRoomId({ creator: userId, type, createdAt })

    // Get available metadata sources for the user (includes Tidal if linked)
    const availableMetadataSources =
      requestedMetadataSourceIds || (await getAvailableMetadataSourcesForUser(context, userId))

    // Auto-configure adapter IDs based on room type
    const { playbackControllerId, metadataSourceIds, mediaSourceId, mediaSourceConfig } =
      configureAdaptersForRoomType({
        type,
        playbackControllerId: requestedPlaybackControllerId,
        metadataSourceIds: availableMetadataSources,
        mediaSourceId: requestedMediaSourceId,
        mediaSourceConfig: requestedMediaSourceConfig,
        radioMetaUrl,
      })

    const room = withDefaults({
      title,
      creator: userId,
      type,
      radioMetaUrl,
      radioProtocol,
      radioListenUrl,
      id,
      createdAt,
      deputizeOnJoin,
      lastRefreshedAt: createdAt,
      playbackControllerId,
      metadataSourceIds,
      mediaSourceId,
      mediaSourceConfig,
    })
    await saveRoom({ context, room })

    // Initialize plugins for the new room FIRST
    // This must happen before media source jobs start to ensure plugins receive events
    if (context.pluginRegistry) {
      await context.pluginRegistry.syncRoomPlugins(id, room)
    }

    // Notify the playback controller adapter that a room was created
    // This allows the adapter to register any necessary jobs (e.g., polling)
    if (playbackControllerId) {
      const adapter = context.adapters.playbackControllerModules.get(playbackControllerId)
      if (adapter?.onRoomCreated) {
        await adapter.onRoomCreated({
          roomId: id,
          userId,
          roomType: type,
          context,
        })
      }
    }

    // Notify the media source adapter that a room was created
    // This allows the adapter to register any necessary jobs (e.g., polling)
    if (mediaSourceId) {
      const adapter = context.adapters.mediaSourceModules.get(mediaSourceId)
      if (adapter?.onRoomCreated) {
        await adapter.onRoomCreated({
          roomId: id,
          userId,
          roomType: type,
          context,
        })
      }
    }

    res.send({ room })
  } catch (e) {
    console.log("Error creating room:", e)
    res.statusCode = e === "Unauthorized" ? 401 : 400
    res.send({ error: e, status: e === "Unauthorized" ? 401 : 400 })
  }
}

export async function findRoom(req: Request, res: Response) {
  const { id } = req.params
  const { context } = req

  const room = await findRoomData({ context, roomId: id })
  if (room?.id) {
    return res.send({ room: removeSensitiveRoomAttributes(room) })
  }
  res.statusCode = 404
  return res.send({ room: null })
}

export async function findRooms(req: Request, res: Response) {
  const { context } = req
  if (!req.session.user?.userId) {
    return res.status(401).send({
      error: "Unauthorized",
    })
  }

  const rooms = await getUserRooms({ context, userId: req.session.user?.userId || "s" })

  return res.status(200).send({
    rooms: rooms.map(parseRoom).map(removeSensitiveRoomAttributes),
  })
}

export async function findAllRooms(req: Request, res: Response) {
  const { context } = req
  const rooms = await getAllRooms({ context })

  // Fetch additional data for each room (user count, now playing, creator name)
  const roomsWithDetails = await Promise.all(
    rooms.map(async (room) => {
      const parsedRoom = parseRoom(room)
      const sanitizedRoom = removeSensitiveRoomAttributes(parsedRoom)

      try {
        const [onlineUsers, currentMeta, creatorUser] = await Promise.all([
          getRoomOnlineUsers({ context, roomId: room.id }),
          getRoomCurrent({ context, roomId: room.id }),
          room.creator ? getUser({ context, userId: room.creator }) : null,
        ])

        return {
          ...sanitizedRoom,
          creatorName: creatorUser?.username ?? sanitizedRoom.creator,
          userCount: onlineUsers?.length ?? 0,
          nowPlaying: currentMeta?.nowPlaying ?? null,
        }
      } catch {
        // If fetching additional data fails, return room without it
        return {
          ...sanitizedRoom,
          creatorName: sanitizedRoom.creator,
          userCount: 0,
          nowPlaying: null,
        }
      }
    }),
  )

  return res.status(200).send({
    rooms: roomsWithDetails,
  })
}

export async function deleteRoom(req: Request, res: Response) {
  const { context } = req
  if (!req.params.id) {
    res.statusCode = 400
    return res.send({
      success: false,
      error: "No room id provided",
    })
  }

  const room = await findRoomData({ context, roomId: req.params.id })

  if (!room || room.creator !== req.session.user?.userId) {
    res.statusCode = 401
    return res.send({
      success: false,
      error: "Unauthorized",
    })
  }

  await deleteRoomData({ context, roomId: req.params.id })
  return res.send({
    success: true,
    roomId: req.params.id,
  })
}

/**
 * Rooms Controller - Manages room-related socket events
 *
 * Improved pattern: Uses closure to avoid repetitive { socket, io } passing
 * Calls handler adapters directly, eliminating the intermediate handler layer
 */
export function createRoomsController(socket: SocketWithContext, io: Server): void {
  // Create handler instance once - it's reused for all events on this socket
  const handlers = createRoomHandlers(socket.context)

  // Create connections object once in closure - no need to pass repeatedly
  const connections = { socket, io }

  /**
   * Get room settings
   */
  socket.on("GET_ROOM_SETTINGS", async (url: string) => {
    await handlers.getRoomSettings(connections)
  })

  /**
   * Get latest room data based on snapshot
   */
  socket.on("GET_LATEST_ROOM_DATA", async (snapshot: RoomSnapshot) => {
    await handlers.getLatestRoomData(connections, snapshot)
  })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createRoomsController instead
 */
export default createRoomsController
