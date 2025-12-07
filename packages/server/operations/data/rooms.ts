import { difference, isEmpty, isNullish } from "remeda"

import { Room, RoomMeta, StoredRoom } from "@repo/types/Room"
import { writeJsonToHset, getHMembersFromSet } from "./utils"
import { getQueue } from "./djs"
import { User } from "@repo/types/User"
import { QueueItem, AppContext, roomMetaToRedisSchema, redisToRoomMetaSchema } from "@repo/types"

type AddRoomToRoomListParams = {
  context: AppContext
  roomId: Room["id"]
}

async function addRoomToRoomList({ context, roomId }: AddRoomToRoomListParams) {
  await context.redis.pubClient.sAdd("rooms", roomId)
}

type RemoveRoomFromRoomListParams = {
  context: AppContext
  roomId: Room["id"]
}

export async function removeRoomFromRoomList({ context, roomId }: RemoveRoomFromRoomListParams) {
  await context.redis.pubClient.sRem("rooms", roomId)
}

type AddRoomToUserRoomListParams = {
  context: AppContext
  room: Room
}

async function addRoomToUserRoomList({ context, room }: AddRoomToUserRoomListParams) {
  await context.redis.pubClient.sAdd(`user:${room.creator}:rooms`, room.id)
}

type RemoveRoomFromUserRoomListParams = {
  context: AppContext
  room: Room
}

async function removeRoomFromUserRoomList({ context, room }: RemoveRoomFromUserRoomListParams) {
  await context.redis.pubClient.sRem(`user:${room.creator}:rooms`, room.id)
}

type GetUserRoomsParams = {
  context: AppContext
  userId: User["userId"]
}

export async function getUserRooms({ context, userId }: GetUserRoomsParams) {
  return getHMembersFromSet<StoredRoom>({
    context,
    setKey: `user:${userId}:rooms`,
    recordPrefix: "room",
    recordSuffix: "details",
  })
}

type SaveRoomParams = {
  context: AppContext
  room: Room
}

export async function saveRoom({ context, room }: SaveRoomParams) {
  try {
    await addRoomToRoomList({ context, roomId: room.id })
    await addRoomToUserRoomList({ context, room })

    // Ensure mediaSourceConfig and metadataSourceIds are JSON-stringified before saving
    const roomToSave = {
      ...room,
      ...(room.mediaSourceConfig
        ? { mediaSourceConfig: JSON.stringify(room.mediaSourceConfig) }
        : {}),
      ...(room.metadataSourceIds
        ? { metadataSourceIds: JSON.stringify(room.metadataSourceIds) }
        : {}),
    }

    return writeJsonToHset({
      context,
      setKey: `room:${room.id}:details`,
      attributes: roomToSave,
    })
  } catch (e) {
    console.log("ERROR FROM data/rooms/persistRoom", room)
    console.error(e)
  }
}

type UpdateRoomParams = {
  context: AppContext
  roomId: string
  room: Partial<Room>
}

export async function updateRoom({ context, roomId, room }: UpdateRoomParams) {
  try {
    await writeJsonToHset({
      context,
      setKey: `room:${roomId}:details`,
      attributes: room,
    })
    const updated = await findRoom({ context, roomId })
    return updated
  } catch (e) {
    console.log("ERROR FROM data/rooms/updateRoom", room)
    console.error(e)
    return null
  }
}

type DelRoomKeyParams = {
  context: AppContext
  roomId: string
  namespace: string
  key: keyof Room
}

export async function delRoomKey({ context, roomId, namespace, key }: DelRoomKeyParams) {
  try {
    await context.redis.pubClient.unlink(`room:${roomId}:${namespace}${key}`)
  } catch (e) {
    console.log("ERROR FROM data/rooms/delRoomKey", roomId, namespace, key)
    console.error(e)
  }
}

type FindRoomParams = {
  context: AppContext
  roomId: string
}

export async function findRoom({ context, roomId }: FindRoomParams) {
  const roomKey = `room:${roomId}:details`
  try {
    const results = await context.redis.pubClient.hGetAll(roomKey)

    if (isEmpty(results)) {
      return null
    } else {
      const parsed = parseRoom(results as unknown as StoredRoom)
      return parsed
    }
  } catch (e) {
    console.log("ERROR FROM data/rooms/findRoom", roomId)
    console.error(e)
  }
}

type SetRoomFetchingParams = {
  context: AppContext
  roomId: string
  value: boolean
}

export async function setRoomFetching({ context, roomId, value }: SetRoomFetchingParams) {
  try {
    await context.redis.pubClient.set(`room:${roomId}:fetching`, value ? "1" : "0")
  } catch (e) {
    console.log("ERROR FROM data/rooms/setRoomFetching", roomId, value)
    console.error(e)
  }
}

type GetRoomFetchingParams = {
  context: AppContext
  roomId: string
}

export async function getRoomFetching({ context, roomId }: GetRoomFetchingParams) {
  try {
    const result = await context.redis.pubClient.get(`room:${roomId}:fetching`)
    return result === "1"
  } catch (e) {
    console.log("ERROR FROM data/rooms/getRoomFetching", roomId)
    console.error(e)
  }
}

type SetRoomCurrentParams = {
  context: AppContext
  roomId: string
  meta: RoomMeta
}

export async function setRoomCurrent({ context, roomId, meta }: SetRoomCurrentParams) {
  const roomCurrentKey = `room:${roomId}:current`
  const payload = await makeJukeboxCurrentPayload({
    context,
    roomId,
    nowPlaying: meta.nowPlaying ?? undefined,
    meta,
  })
  if (!payload) {
    return null
  }

  const parsedMeta = payload.data.meta
  try {
    await context.redis.pubClient.hDel(roomCurrentKey, [
      "dj",
      "release",
      "artwork",
      "stationMeta",
      "nowPlaying",
    ])

    // Transform RoomMeta to Redis-storable strings using Zod schema
    const attributes = roomMetaToRedisSchema.parse(parsedMeta)

    await writeJsonToHset({
      context,
      setKey: roomCurrentKey,
      attributes,
    })
    const current = await getRoomCurrent({ context, roomId })
    return current
  } catch (e) {
    console.error(e)
    console.error("Error from data/rooms/setRoomCurrent", roomId, meta)
    return null
  }
}

type ClearRoomCurrentParams = {
  context: AppContext
  roomId: string
  omitKeys?: (keyof RoomMeta)[]
}

export async function clearRoomCurrent({ context, roomId, omitKeys }: ClearRoomCurrentParams) {
  const roomCurrentKey = `room:${roomId}:current`
  try {
    // First, get current state before clearing (to return stationMeta etc.)
    const current = await getRoomCurrent({ context, roomId })

    await context.redis.pubClient.hDel(
      roomCurrentKey,
      difference(
        [
          "album",
          "dj",
          "release",
          "artwork",
          "title",
          "bitrate",
          "track",
          "artist",
          "lastUpdatedAt",
          "nowPlaying", // Also clear nowPlaying to force re-processing
        ],
        omitKeys ?? [],
      ),
    )

    return current
  } catch (e) {
    console.error(e)
    console.error("Error from data/rooms/clearRoomCurrent", roomId)
    return null
  }
}

type GetRoomCurrentParams = {
  context: AppContext
  roomId: string
}

export async function getRoomCurrent({ context, roomId }: GetRoomCurrentParams) {
  const roomCurrentKey = `room:${roomId}:current`
  const result = await context.redis.pubClient.hGetAll(roomCurrentKey)

  // Transform Redis strings to RoomMeta using Zod schema (handles corrupt data gracefully)
  const parsed = redisToRoomMetaSchema.safeParse(result)

  if (!parsed.success) {
    console.warn(`[getRoomCurrent] Parse error for room ${roomId}:`, parsed.error.flatten())
    // Return minimal valid data
    return {
      title: result.title,
      artist: result.artist,
      album: result.album,
      track: result.track,
      artwork: result.artwork,
      lastUpdatedAt: result.lastUpdatedAt,
    } as RoomMeta
  }

  const roomMeta = parsed.data as RoomMeta

  // Augment now playing data with plugin metadata
  if (roomMeta.nowPlaying) {
    const augmentedNowPlaying = await context.pluginRegistry.augmentNowPlaying(roomId, roomMeta.nowPlaying)
    return {
      ...roomMeta,
      nowPlaying: augmentedNowPlaying,
    }
  }

  return roomMeta
}

type MakeJukeboxCurrentPayloadParams = {
  context: AppContext
  roomId: string
  nowPlaying: QueueItem | undefined
  meta?: RoomMeta
}

export async function makeJukeboxCurrentPayload({
  context,
  roomId,
  nowPlaying,
  meta = {
    nowPlaying: undefined,
    dj: undefined,
    bitrate: undefined,
    lastUpdatedAt: undefined,
    stationMeta: undefined,
  },
}: MakeJukeboxCurrentPayloadParams) {
  try {
    const currentlyPlaying = await getRoomCurrent({ context, roomId })
    const trackIsCurrent = currentlyPlaying?.nowPlaying?.track?.id === nowPlaying?.track?.id
    const room = await findRoom({ context, roomId })
    const artwork = room?.artwork ?? nowPlaying?.track?.album?.images?.[0]?.url
    const queue = await getQueue({ context, roomId })
    const queuedTrack = queue.find((x) => x.track?.id === nowPlaying?.track?.id)
    const trackDj = trackIsCurrent ? currentlyPlaying?.dj : queuedTrack ? queuedTrack.addedBy : null

    return {
      type: "META",
      data: {
        meta: {
          ...meta,
          title: nowPlaying?.track.title ?? meta.nowPlaying?.track.title,
          bitrate: 360,
          artist:
            nowPlaying?.track.artists?.map((x) => x.title).join(", ") ??
            meta.nowPlaying?.track.artists?.map((x) => x.title).join(", "),
          album: nowPlaying?.track.album?.title ?? meta.nowPlaying?.track.album.title,
          track: nowPlaying?.track.title ?? meta.nowPlaying?.track.title,
          nowPlaying: nowPlaying ?? meta.nowPlaying, // Use nowPlaying (new format)
          release: nowPlaying ?? meta.nowPlaying, // Keep release for backward compatibility
          artwork,
          dj: trackDj,
        },
      },
    }
  } catch (e) {
    console.log("ERROR", e)
  }
}

type RemoveUserRoomsSpotifyErrorParams = {
  context: AppContext
  userId: string
}

export async function removeUserRoomsSpotifyError({
  context,
  userId,
}: RemoveUserRoomsSpotifyErrorParams) {
  const userCreatedRooms = await context.redis.pubClient.sMembers(`user:${userId}:rooms`)

  await Promise.all(
    userCreatedRooms.map((roomId) => {
      return context.redis.pubClient.hDel(`room:${roomId}:details`, "spotifyError")
    }),
  )
}

export function parseRoom(room: StoredRoom): Room {
  // Helper to safely parse JSON or return the value if already an object
  const safeParse = (value: any) => {
    if (!value) return undefined
    if (typeof value === "object") return value
    try {
      return JSON.parse(value)
    } catch (e) {
      console.error("Failed to parse JSON:", value, e)
      return undefined
    }
  }

  return {
    ...room,
    fetchMeta: room.fetchMeta === "true",
    enableSpotifyLogin: room.enableSpotifyLogin === "true",
    deputizeOnJoin: room.deputizeOnJoin === "true",
    persistent: room.persistent === "true",
    announceNowPlaying: room.announceNowPlaying === "true",
    announceUsernameChanges: room.announceUsernameChanges === "true",
    passwordRequired: !isNullish(room.password),
    ...(room.artwork === "undefined" ? {} : { artwork: room.artwork }),
    ...(room.spotifyError ? { spotifyError: safeParse(room.spotifyError) } : {}),
    ...(room.radioError ? { radioError: safeParse(room.radioError) } : {}),
    ...(room.mediaSourceConfig ? { mediaSourceConfig: safeParse(room.mediaSourceConfig) } : {}),
    ...(room.metadataSourceIds ? { metadataSourceIds: safeParse(room.metadataSourceIds) } : {}),
  }
}

export function removeSensitiveRoomAttributes(room: Room) {
  return {
    ...room,
    password: null,
  }
}

type GetAllRoomDataKeysParams = {
  context: AppContext
  roomId: string
}

async function getAllRoomDataKeys({ context, roomId }: GetAllRoomDataKeysParams) {
  const keys = []
  for await (const key of context.redis.pubClient.scanIterator({
    MATCH: `room:${roomId}:*`,
  })) {
    keys.push(key)
  }
  return keys
}

type DeleteRoomParams = {
  context: AppContext
  roomId: string
}

export async function deleteRoom({ context, roomId }: DeleteRoomParams) {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return
  }

  // Emit roomDeleted event via SystemEvents
  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "ROOM_DELETED", { roomId })
  }

  // Cleanup plugin room state
  if (context.pluginRegistry) {
    try {
      await context.pluginRegistry.cleanupRoom(roomId)
    } catch (error) {
      console.error("[Plugins] Error cleaning up room:", error)
    }
  }

  // Delete all plugin configurations
  const { deleteAllPluginConfigs } = await import("./pluginConfigs")
  await deleteAllPluginConfigs({ context, roomId })

  // Notify the playback controller adapter that the room is being deleted
  // This allows the adapter to clean up any jobs or resources (e.g., stop polling)
  if (room.playbackControllerId) {
    const adapter = context.adapters.playbackControllerModules.get(room.playbackControllerId)
    if (adapter?.onRoomDeleted) {
      try {
        await adapter.onRoomDeleted({ roomId, context })
      } catch (error) {
        console.error(
          `Error calling onRoomDeleted for adapter ${room.playbackControllerId}:`,
          error,
        )
      }
    }
  }

  // Notify the media source adapter that the room is being deleted
  // This allows the adapter to clean up any jobs or resources (e.g., stop polling)
  if (room.mediaSourceId) {
    const adapter = context.adapters.mediaSourceModules.get(room.mediaSourceId)
    if (adapter?.onRoomDeleted) {
      try {
        await adapter.onRoomDeleted({ roomId, context })
      } catch (error) {
        console.error(
          `Error calling onRoomDeleted for MediaSource adapter ${room.mediaSourceId}:`,
          error,
        )
      }
    }
  }

  // Get all keys relating to room
  const keys = await getAllRoomDataKeys({ context, roomId })
  // delete them
  await Promise.all(keys.map((k) => context.redis.pubClient.unlink(k)))
  // remove room from room list and user's room list
  await removeRoomFromRoomList({ context, roomId: room.id })
  await removeRoomFromUserRoomList({ context, room })
}

type ExpireRoomInParams = {
  context: AppContext
  roomId: string
  ms: number
}

export async function expireRoomIn({ context, roomId, ms }: ExpireRoomInParams) {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return
  }
  const keys = await getAllRoomDataKeys({ context, roomId })
  await Promise.all(keys.map((k) => context.redis.pubClient.pExpire(k, ms)))
}

type PersistRoomParams = {
  context: AppContext
  roomId: string
}

export async function persistRoom({ context, roomId }: PersistRoomParams) {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return
  }
  const keys = await getAllRoomDataKeys({ context, roomId })
  await Promise.all(keys.map((k) => context.redis.pubClient.persist(k)))
}

type GetRoomOnlineUserIdsParams = {
  context: AppContext
  roomId: string
}

export async function getRoomOnlineUserIds({ context, roomId }: GetRoomOnlineUserIdsParams) {
  const ids = context.redis.pubClient.sMembers(`room:${roomId}:online_users`)
  return ids
}

type EmitRoomSettingsUpdatedParams = {
  context: AppContext
  roomId: string
  room?: Room // Optional - will fetch if not provided
}

/**
 * Emit a ROOM_SETTINGS_UPDATED event via SystemEvents.
 * Includes all plugin configs in the event payload.
 */
export async function emitRoomSettingsUpdated({
  context,
  roomId,
  room,
}: EmitRoomSettingsUpdatedParams) {
  // Fetch room if not provided
  let roomData: Room | null | undefined = room
  if (!roomData) {
    roomData = await findRoom({ context, roomId })
  }

  // Emit via SystemEvents if we have room data
  if (roomData && context.systemEvents) {
    // Fetch plugin configs to include in the event
    const { getAllPluginConfigs } = await import("./pluginConfigs")
    const pluginConfigs = await getAllPluginConfigs({ context, roomId })

    await context.systemEvents.emit(roomId, "ROOM_SETTINGS_UPDATED", {
      roomId,
      room: roomData,
      pluginConfigs,
    })
  }
}

/** @deprecated Use emitRoomSettingsUpdated instead */
export const pubRoomSettingsUpdated = emitRoomSettingsUpdated

type GetRoomOnlineUsersParams = {
  context: AppContext
  roomId: string
}

export async function getRoomOnlineUsers({ context, roomId }: GetRoomOnlineUsersParams) {
  const users = await getHMembersFromSet<User>({
    context,
    setKey: `room:${roomId}:online_users`,
    recordPrefix: "user",
    recordSuffix: undefined,
  })
  return users
}

type ClearRoomOnlineUsersParams = {
  context: AppContext
  roomId: string
}

export async function clearRoomOnlineUsers({ context, roomId }: ClearRoomOnlineUsersParams) {
  await context.redis.pubClient.unlink(`room:${roomId}:online_users`)
}

type NukeUserRoomsParams = {
  context: AppContext
  userId: string
}

export async function nukeUserRooms({ context, userId }: NukeUserRoomsParams) {
  const rooms = await getUserRooms({ context, userId })
  await context.redis.pubClient.unlink(`user:${userId}:rooms`)
  await Promise.all(rooms.map((room) => deleteRoom({ context, roomId: room.id })))
}
