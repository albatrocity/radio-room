import { Request, Response } from "express"
import { Server } from "socket.io"
import { createRoomId, withDefaults } from "../operations/createRoom"
import {
  findRoom as findRoomData,
  deleteRoom as deleteRoomData,
  saveRoom,
  parseRoom,
  removeSensitiveRoomAttributes,
  getAllRooms,
  getUserServiceAuth,
  getRoomOnlineUsers,
  getRoomCurrent,
  getUser,
} from "../operations/data"
import { checkUserChallenge } from "../operations/userChallenge"
import * as scheduling from "../services/SchedulingService"
import { RoomSnapshot } from "@repo/types/Room"
import { SocketWithContext } from "../lib/socketWithContext"
import { createRoomHandlers } from "../handlers/roomHandlersAdapter"
import {
  AppContext,
  RoomScheduleSnapshotDTO,
  ITEM_SHOPS_PLUGIN_NAME,
  ITEM_SHOPS_SESSION_STORAGE_KEYS,
  type ShoppingSessionInstance,
} from "@repo/types"
import { readRoomScheduleSnapshot, refreshRoomScheduleSnapshot } from "../operations/scheduleRedisSnapshot"
import { PluginStorageImpl } from "../lib/plugins/PluginStorage"

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
  type: "jukebox" | "radio" | "live"
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
      metadataSourceIds: metadataSourceIds,
      mediaSourceId: mediaSourceId || "spotify",
      mediaSourceConfig,
    }
  } else if (type === "radio") {
    return {
      playbackControllerId: playbackControllerId || "spotify",
      metadataSourceIds: metadataSourceIds,
      mediaSourceId: mediaSourceId || "shoutcast",
      mediaSourceConfig: mediaSourceConfig || (radioMetaUrl ? { url: radioMetaUrl } : undefined),
    }
  } else if (type === "live") {
    return {
      playbackControllerId: playbackControllerId || "spotify",
      metadataSourceIds: metadataSourceIds,
      mediaSourceId: mediaSourceId || "rtmp",
      mediaSourceConfig,
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
    showId: requestedShowId,
    public: isPublic,
    liveIngestEnabled,
    liveWhepUrl,
    liveHlsUrl,
  } = req.body
  const createdAt = Date.now().toString()
  console.log("radioListenUrl", radioListenUrl)

  const { context } = req

  try {
    await checkUserChallenge({ challenge, userId, context })

    let showId: string | undefined
    if (requestedShowId != null && requestedShowId !== "") {
      const attachedShow = await scheduling.findShowById(String(requestedShowId))
      if (!attachedShow) {
        res.statusCode = 400
        return res.send({ error: "Show not found", status: 400 })
      }
      if (attachedShow.status !== "ready") {
        res.statusCode = 400
        return res.send({ error: "Show must be in ready state to attach", status: 400 })
      }
      showId = attachedShow.id
    }

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
      ...(showId ? { showId, persistent: true } : {}),
      ...(isPublic !== undefined ? { public: isPublic } : {}),
      ...(liveIngestEnabled !== undefined ? { liveIngestEnabled: !!liveIngestEnabled } : {}),
      ...(liveWhepUrl !== undefined ? { liveWhepUrl: liveWhepUrl || undefined } : {}),
      ...(liveHlsUrl !== undefined ? { liveHlsUrl: liveHlsUrl || undefined } : {}),
    })
    await saveRoom({ context, room })

    if (showId) {
      try {
        await scheduling.syncShowRoomPointer({ roomId: id, nextShowId: showId })
      } catch (e) {
        console.error("[createRoom] Failed to sync show.room_id:", e)
        res.statusCode = 500
        return res.send({ error: "Failed to link show to room in scheduling", status: 500 })
      }
      await refreshRoomScheduleSnapshot(context, id)
    }

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
    let scheduleSnapshot: RoomScheduleSnapshotDTO | null = null
    if (room.showId) {
      scheduleSnapshot = await readRoomScheduleSnapshot(context, id)
      if (!scheduleSnapshot) {
        await refreshRoomScheduleSnapshot(context, id)
        scheduleSnapshot = await readRoomScheduleSnapshot(context, id)
      }
    }
    return res.send({
      room: removeSensitiveRoomAttributes(room),
      scheduleSnapshot,
    })
  }
  res.statusCode = 404
  return res.send({ room: null, scheduleSnapshot: null })
}

export async function findRooms(req: Request, res: Response) {
  const { context } = req
  if (!req.session.user?.userId) {
    return res.status(401).send({
      error: "Unauthorized",
    })
  }

  const userId = req.session.user.userId

  // Filter all rooms by creator (using string coercion for type safety)
  const allRooms = await getAllRooms({ context })
  const rooms = allRooms.filter((r) => String(r.creator) === String(userId))

  return res.status(200).send({
    rooms: rooms.map(parseRoom).map(removeSensitiveRoomAttributes),
  })
}

export async function findAllRooms(req: Request, res: Response) {
  const { context } = req
  const rooms = await getAllRooms({ context })

  const publicRooms = rooms.filter((room) => {
    const val = room.public as unknown
    return val !== false && val !== "false"
  })

  // Fetch additional data for each room (user count, now playing, creator name)
  const roomsWithDetails = await Promise.all(
    publicRooms.map(async (room) => {
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

  /**
   * Return the requesting user's game state and inventory for the active session.
   * Responds with `USER_GAME_STATE` on this socket only.
   */
  socket.on("GET_MY_GAME_STATE", async () => {
    const gameSessions = socket.context.gameSessions
    const inventory = socket.context.inventory

    if (!gameSessions) {
      socket.emit("event", {
        type: "USER_GAME_STATE",
        data: {
          session: null,
          state: null,
          inventory: null,
          itemDefinitions: [],
          currentShopInstance: null,
        },
      })
      return
    }

    const session = await gameSessions.getActiveSession(socket.data.roomId)
    if (!session) {
      socket.emit("event", {
        type: "USER_GAME_STATE",
        data: {
          session: null,
          state: null,
          inventory: null,
          itemDefinitions: [],
          currentShopInstance: null,
        },
      })
      return
    }

    const state = await gameSessions.getUserState(socket.data.roomId, socket.data.userId)
    const inv = inventory
      ? await inventory.getInventory(socket.data.roomId, socket.data.userId)
      : null
    const itemDefinitions = inventory
      ? await inventory.getAllItemDefinitions(socket.data.roomId)
      : []

    let currentShopInstance: ShoppingSessionInstance | null = null
    if (inventory) {
      const storage = new PluginStorageImpl(
        socket.context,
        ITEM_SHOPS_PLUGIN_NAME,
        socket.data.roomId,
      )
      const active = await storage.get(ITEM_SHOPS_SESSION_STORAGE_KEYS.ACTIVE)
      if (active === "true") {
        const raw = await storage.hget(
          ITEM_SHOPS_SESSION_STORAGE_KEYS.INSTANCES,
          socket.data.userId,
        )
        if (raw) {
          try {
            currentShopInstance = JSON.parse(raw) as ShoppingSessionInstance
          } catch {
            currentShopInstance = null
          }
        }
      }
    }

    socket.emit("event", {
      type: "USER_GAME_STATE",
      data: {
        session,
        state,
        inventory: inv,
        itemDefinitions,
        currentShopInstance,
      },
    })
  })

  /**
   * Return the active session's modifier snapshot for every participant.
   * Responds with `ROOM_GAME_STATE` on this socket only. Used by the client
   * to hydrate per-user effect bars for the listener list.
   */
  socket.on("GET_ROOM_GAME_STATE", async () => {
    const gameSessions = socket.context.gameSessions

    if (!gameSessions) {
      socket.emit("event", {
        type: "ROOM_GAME_STATE",
        data: { sessionId: null, modifiersByUserId: {} },
      })
      return
    }

    const snapshot = await gameSessions.getActiveModifiersByUser(socket.data.roomId)
    if (!snapshot) {
      socket.emit("event", {
        type: "ROOM_GAME_STATE",
        data: { sessionId: null, modifiersByUserId: {} },
      })
      return
    }

    socket.emit("event", {
      type: "ROOM_GAME_STATE",
      data: snapshot,
    })
  })

  /**
   * Use an inventory item. Looks up the item in the user's inventory and
   * dispatches to the source plugin's `onItemUsed` handler. The plugin
   * decides whether the item is consumed.
   *
   * Responds with `INVENTORY_ACTION_RESULT` on this socket only.
   */
  socket.on(
    "USE_INVENTORY_ITEM",
    async (data: { itemId: string; targetUserId?: string; targetQueueItemId?: string }) => {
    const inventory = socket.context.inventory
    if (!inventory) {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: { success: false, message: "Inventory service not available" },
      })
      return
    }

    if (!data?.itemId) {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: { success: false, message: "Missing itemId" },
      })
      return
    }

    const callContext =
      data.targetUserId != null || data.targetQueueItemId != null
        ? {
            ...(data.targetUserId != null ? { targetUserId: data.targetUserId } : {}),
            ...(data.targetQueueItemId != null
              ? { targetQueueItemId: data.targetQueueItemId }
              : {}),
          }
        : undefined
    const result = await inventory.useItem(
      socket.data.roomId,
      socket.data.userId,
      data.itemId,
      callContext,
    )

    socket.emit("event", {
      type: "INVENTORY_ACTION_RESULT",
      data: { success: result.success, message: result.message },
    })
    },
  )

  /**
   * Sell an inventory item back to its owning plugin (typically a shop).
   * Looks up the item, finds its source plugin, and dispatches to the
   * plugin's `onItemSold` handler. The plugin handles the sale (removing
   * the item, crediting coins, restocking, etc.).
   *
   * Responds with `INVENTORY_ACTION_RESULT` on this socket only.
   */
  socket.on("SELL_INVENTORY_ITEM", async (data: { itemId: string }) => {
    const inventory = socket.context.inventory
    const registry = socket.context.pluginRegistry as
      | {
          invokeOnItemSold?: (
            roomId: string,
            pluginName: string,
            userId: string,
            item: import("@repo/types").InventoryItem,
            definition: import("@repo/types").ItemDefinition,
            callContext: unknown,
          ) => Promise<import("@repo/types").ItemSellResult | null>
        }
      | undefined

    if (!inventory || !registry?.invokeOnItemSold) {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: { success: false, message: "Inventory service not available" },
      })
      return
    }

    if (!data?.itemId) {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: { success: false, message: "Missing itemId" },
      })
      return
    }

    const inv = await inventory.getInventory(socket.data.roomId, socket.data.userId)
    const item = (inv.items as import("@repo/types").InventoryItem[]).find(
      (i) => i.itemId === data.itemId,
    )
    if (!item) {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: { success: false, message: "Item not found in inventory" },
      })
      return
    }

    const definition = await inventory.getItemDefinition(socket.data.roomId, item.definitionId)
    if (!definition) {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: { success: false, message: "Item definition not found" },
      })
      return
    }

    const result = await registry.invokeOnItemSold(
      socket.data.roomId,
      definition.sourcePlugin,
      socket.data.userId,
      item,
      definition,
      undefined,
    )

    if (!result) {
      socket.emit("event", {
        type: "INVENTORY_ACTION_RESULT",
        data: { success: false, message: "This item can't be sold." },
      })
      return
    }

    socket.emit("event", {
      type: "INVENTORY_ACTION_RESULT",
      data: { success: result.success, message: result.message, refund: result.refund },
    })
  })
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use createRoomsController instead
 */
export default createRoomsController
