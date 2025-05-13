import { difference, isEmpty, isNil } from "remeda";

import { pubClient } from "../../lib/redisClients";
import { Room, RoomMeta, StoredRoom, StoredRoomMeta } from "../../types/Room";
import { writeJsonToHset, getHMembersFromSet } from "./utils";
import { SpotifyTrack } from "../../types/SpotifyTrack";
import { getQueue } from "./djs";
import { User } from "../../types/User";
import { PUBSUB_ROOM_DELETED } from "../../lib/constants";
import { RoomNowPlaying } from "../../types/RoomNowPlaying";

async function addRoomToRoomList(roomId: Room["id"]) {
  await pubClient.sAdd("rooms", roomId);
}
export async function removeRoomFromRoomList(roomId: Room["id"]) {
  await pubClient.sRem("rooms", roomId);
}

async function addRoomToUserRoomList(room: Room) {
  await pubClient.sAdd(`user:${room.creator}:rooms`, room.id);
}
async function removeRoomFromUserRoomList(room: Room) {
  await pubClient.sRem(`user:${room.creator}:rooms`, room.id);
}
export async function getUserRooms(userId: User["userId"]) {
  return getHMembersFromSet<StoredRoom>(
    `user:${userId}:rooms`,
    "room",
    "details"
  );
}

export async function saveRoom(room: Room) {
  try {
    await addRoomToRoomList(room.id);
    await addRoomToUserRoomList(room);
    return writeJsonToHset(`room:${room.id}:details`, room);
  } catch (e) {
    console.log("ERROR FROM data/rooms/persistRoom", room);
    console.error(e);
  }
}

export async function updateRoom(roomId: string, room: Partial<Room>) {
  try {
    await writeJsonToHset(`room:${roomId}:details`, room);
    const updated = await findRoom(roomId);
    return updated;
  } catch (e) {
    console.log("ERROR FROM data/rooms/updateRoom", room);
    console.error(e);
    return null;
  }
}

export async function delRoomKey(
  roomId: string,
  namespace: string,
  key: keyof Room
) {
  try {
    await pubClient.unlink(`room:${roomId}:${namespace}${key}`);
  } catch (e) {
    console.log("ERROR FROM data/rooms/delRoomKey", roomId, namespace, key);
    console.error(e);
  }
}

export async function findRoom(roomId: string) {
  const roomKey = `room:${roomId}:details`;
  try {
    const results = await pubClient.hGetAll(roomKey);

    if (isEmpty(results)) {
      return null;
    } else {
      const parsed = parseRoom(results as unknown as StoredRoom);
      return parsed;
    }
  } catch (e) {
    console.log("ERROR FROM data/rooms/findRoom", roomId);
    console.error(e);
  }
}

export async function setRoomFetching(roomId: string, value: boolean) {
  try {
    await pubClient.set(`room:${roomId}:fetching`, value ? "1" : "0");
  } catch (e) {
    console.log("ERROR FROM data/rooms/setRoomFetching", roomId, value);
    console.error(e);
  }
}

export async function getRoomFetching(roomId: string) {
  try {
    const result = await pubClient.get(`room:${roomId}:fetching`);
    return result === "1";
  } catch (e) {
    console.log("ERROR FROM data/rooms/getRoomFetching", roomId);
    console.error(e);
  }
}

export async function setRoomCurrent(roomId: string, meta: RoomMeta) {
  const roomCurrentKey = `room:${roomId}:current`;
  const payload = await makeJukeboxCurrentPayload(roomId, meta.release, meta);
  const parsedMeta = payload.data.meta;
  try {
    await pubClient.hDel(roomCurrentKey, ["dj", "release", "artwork"]);

    await writeJsonToHset(roomCurrentKey, {
      ...parsedMeta,
      lastUpdatedAt: String(Date.now()),
      release: JSON.stringify(parsedMeta.release),
      dj: parsedMeta.dj ? JSON.stringify(parsedMeta.dj) : undefined,
    });
    const current = await getRoomCurrent(roomId);
    return current;
  } catch (e) {
    console.error(e);
    console.error("Error from data/rooms/setRoomCurrent", roomId, meta);
    return null;
  }
}

export async function clearRoomCurrent(
  roomId: string,
  omitKeys?: (keyof RoomMeta)[]
) {
  const roomCurrentKey = `room:${roomId}:current`;
  try {
    await pubClient.hDel(
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
        omitKeys ?? []
      )
    );

    const current = await getRoomCurrent(roomId);
    return current;
  } catch (e) {
    console.error(e);
    console.error("Error from data/rooms/clearRoomCurrent", roomId);
    return null;
  }
}

export async function getRoomCurrent(roomId: string) {
  const roomCurrentKey = `room:${roomId}:current`;
  const result = await pubClient.hGetAll(roomCurrentKey);
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
    ...(result.stationMeta
      ? { stationMeta: JSON.parse(result.stationMeta) }
      : {}),
  } as RoomMeta;
}

export async function makeJukeboxCurrentPayload(
  roomId: string,
  nowPlaying: RoomNowPlaying | undefined,
  meta: RoomMeta = {}
) {
  try {
    const currentlyPlaying = await getRoomCurrent(roomId);
    const trackIsCurrent = currentlyPlaying?.release?.uri === nowPlaying?.uri;
    const room = await findRoom(roomId);
    const artwork = room?.artwork ?? nowPlaying?.album?.images?.[0]?.url;
    const queue = await getQueue(roomId);
    const queuedTrack = queue.find((x) => x.uri === nowPlaying?.uri);
    const trackDj = trackIsCurrent
      ? currentlyPlaying?.dj
      : queuedTrack
      ? { userId: queuedTrack.userId, username: queuedTrack.username }
      : null;

    return {
      type: "META",
      data: {
        meta: {
          ...meta,
          title: nowPlaying?.name ?? meta.title,
          bitrate: 360,
          artist:
            nowPlaying?.artists?.map((x) => x.name).join(", ") ?? meta.artist,
          album: nowPlaying?.album?.name ?? meta.album,
          track: nowPlaying?.name ?? meta.track,
          release: nowPlaying ?? meta.release,
          artwork,
          dj: trackDj,
        },
      },
    };
  } catch (e) {
    console.log("ERROR", e);
  }
}

export async function removeUserRoomsSpotifyError(userId: string) {
  const userCreatedRooms = await pubClient.sMembers(`user:${userId}:rooms`);

  await Promise.all(
    userCreatedRooms.map((roomId) => {
      return pubClient.hDel(`room:${roomId}:details`, "spotifyError");
    })
  );
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
    passwordRequired: !isNil(room.password),
    ...(room.artwork === "undefined" ? {} : { artwork: room.artwork }),
    ...(room.spotifyError
      ? { spotifyError: JSON.parse(room.spotifyError) }
      : {}),
    ...(room.radioError ? { radioError: JSON.parse(room.radioError) } : {}),
  };
}

export function removeSensitiveRoomAttributes(room: Room) {
  return {
    ...room,
    password: undefined,
  };
}

async function getAllRoomDataKeys(roomId: string) {
  const keys = [];
  for await (const key of pubClient.scanIterator({
    MATCH: `room:${roomId}:*`,
  })) {
    keys.push(key);
  }
  return keys;
}

export async function deleteRoom(roomId: string) {
  const room = await findRoom(roomId);
  if (!room) {
    return;
  }
  // Get all keys relating to room
  const keys = await getAllRoomDataKeys(roomId);
  // delete them
  await Promise.all(keys.map((k) => pubClient.unlink(k)));
  // remove room from room list and user's room list
  await removeRoomFromRoomList(room.id);
  await removeRoomFromUserRoomList(room);
  await pubClient.publish(PUBSUB_ROOM_DELETED, roomId);
}

export async function expireRoomIn(roomId: string, ms: number) {
  const room = await findRoom(roomId);
  if (!room) {
    return;
  }
  const keys = await getAllRoomDataKeys(roomId);
  await Promise.all(keys.map((k) => pubClient.pExpire(k, ms)));
}

export async function persistRoom(roomId: string) {
  const room = await findRoom(roomId);
  if (!room) {
    return;
  }
  const keys = await getAllRoomDataKeys(roomId);
  await Promise.all(keys.map((k) => pubClient.persist(k)));
}

export async function getRoomOnlineUserIds(roomId: string) {
  const ids = pubClient.sMembers(`room:${roomId}:online_users`);
  return ids;
}
export async function getRoomOnlineUsers(roomId: string) {
  const users = await getHMembersFromSet<User>(
    `room:${roomId}:online_users`,
    "user"
  );
  return users;
}
export async function clearRoomOnlineUsers(roomId: string) {
  await pubClient.unlink(`room:${roomId}:online_users`);
}

export async function nukeUserRooms(userId: string) {
  const rooms = await getUserRooms(userId);
  await pubClient.unlink(`user:${userId}:rooms`);
  await Promise.all(rooms.map((room) => deleteRoom(room.id)));
}
