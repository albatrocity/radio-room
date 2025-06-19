import { difference, isEmpty, isNullish } from "remeda"

import { Room, RoomMeta, StoredRoom } from "@repo/types/Room"
import { writeJsonToHset, getHMembersFromSet } from "./utils"
import { getQueue } from "./djs"
import { User } from "@repo/types/User"
import { PUBSUB_ROOM_DELETED } from "../../lib/constants"
import { QueueItem, AppContext } from "@repo/types"

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
    return writeJsonToHset({
      context,
      setKey: `room:${room.id}:details`,
      attributes: room,
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
    nowPlaying: meta.nowPlaying,
    meta,
  })
  if (!payload) {
    return null
  }

  const parsedMeta = payload.data.meta
  try {
    await context.redis.pubClient.hDel(roomCurrentKey, ["dj", "release", "artwork"])

    await writeJsonToHset({
      context,
      setKey: roomCurrentKey,
      attributes: {
        ...parsedMeta,
        lastUpdatedAt: String(Date.now()),
        release: JSON.stringify(parsedMeta.release),
        dj: parsedMeta.dj ? JSON.stringify(parsedMeta.dj) : undefined,
      },
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
        ],
        omitKeys ?? [],
      ),
    )

    const current = await getRoomCurrent({ context, roomId })
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
  return {
    ...result,
    ...(result.release
      ? {
          release: JSON.parse(result.release),
        }
      : {}),
    ...(result.dj
      ? {
          dj: result.dj && JSON.parse(result.dj),
        }
      : {}),
    ...(result.spotifyError
      ? {
          dj: result.spotifyError && JSON.parse(result.spotifyError),
        }
      : {}),
    ...(result.stationMeta ? { stationMeta: JSON.parse(result.stationMeta) } : {}),
  } as RoomMeta
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
    const trackIsCurrent = currentlyPlaying?.nowPlaying?.track.id === nowPlaying?.track.id
    const room = await findRoom({ context, roomId })
    const artwork = room?.artwork ?? nowPlaying?.track.album?.images?.[0]?.url
    const queue = await getQueue({ context, roomId })
    const queuedTrack = queue.find((x) => x.track.id === nowPlaying?.track.id)
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
          release: nowPlaying ?? meta,
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
    ...(room.spotifyError ? { spotifyError: JSON.parse(room.spotifyError) } : {}),
    ...(room.radioError ? { radioError: JSON.parse(room.radioError) } : {}),
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
  // Get all keys relating to room
  const keys = await getAllRoomDataKeys({ context, roomId })
  // delete them
  await Promise.all(keys.map((k) => context.redis.pubClient.unlink(k)))
  // remove room from room list and user's room list
  await removeRoomFromRoomList({ context, roomId: room.id })
  await removeRoomFromUserRoomList({ context, room })
  await context.redis.pubClient.publish(PUBSUB_ROOM_DELETED, roomId)
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
