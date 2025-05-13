import { pubClient } from "../../lib/redisClients";
import { QueuedTrack } from "../../types/QueuedTrack";
import { deleteMembersFromSet, getMembersFromSet } from "./utils";

export async function addDj(roomId: string, userId: string) {
  try {
    return pubClient.sAdd(`room:${roomId}:djs`, userId);
  } catch (e) {
    console.log("ERROR FROM data/djs/addDj", roomId, userId);
    console.error(e);
    return null;
  }
}
export async function removeDj(roomId: string, userId: string) {
  try {
    if (userId) {
      return pubClient.sRem(`room:${roomId}:djs`, userId);
    }
    return null;
  } catch (e) {
    console.log("ERROR FROM data/djs/removeDj", roomId, userId);
    console.error(e);
    return null;
  }
}
export async function getDjs(roomId: string) {
  try {
    return pubClient.sMembers(`room:${roomId}:djs`);
  } catch (e) {
    console.log("ERROR FROM data/djs/getDjs", roomId);
    console.error(e);
    return [];
  }
}
export async function isDj(roomId: string, userId: string) {
  try {
    return pubClient.sIsMember(`room:${roomId}:djs`, userId);
  } catch (e) {
    console.log("ERROR FROM data/djs/getDjs", roomId);
    console.error(e);
    return false;
  }
}

export async function addToQueue(roomId: string, track: QueuedTrack) {
  try {
    const value = JSON.stringify(track);
    await pubClient.sAdd(`room:${roomId}:queue`, track.uri);
    await pubClient.set(`room:${roomId}:queued_track:${track.uri}`, value);
  } catch (e) {
    console.log("ERROR FROM data/djs/addToQueue", roomId, track);
    console.error(e);
    return null;
  }
}

export async function removeFromQueue(roomId: string, uri: QueuedTrack["uri"]) {
  await pubClient.sRem(`room:${roomId}:queue`, uri);
  await pubClient.unlink(`room:${roomId}:queued_track:${uri}`);
  return null;
}

export async function getQueue(roomId: string) {
  try {
    const results = await getMembersFromSet<QueuedTrack>(
      `room:${roomId}:queue`,
      `room:${roomId}:queued_track`
    );
    return results;
  } catch (e) {
    console.log("ERROR FROM data/djs/removeFromQueue", roomId);
    console.error(e);
    return [];
  }
}

export async function setQueue(roomId: string, tracks: QueuedTrack[]) {
  try {
    const currentQueue = await pubClient.sMembers(`room:${roomId}:queue`);

    // Deletes tracks from Redis that are not in the Spotify queue
    const deletes = Promise.all(
      currentQueue.map(async (uri) => {
        const isInQueue = tracks.some((track) => track.uri === uri);
        if (isInQueue) {
          return null;
        }
        await pubClient.sRem(`room:${roomId}:queue`, uri);
        return pubClient.unlink(`room:${roomId}:queued_track:${uri}`);
      })
    );

    await deletes;

    // Writes tracks to Redis that are in the Spotify queue
    const writes = Promise.all(
      tracks.map(async (track) => {
        const isInQueue = await pubClient.sIsMember(
          `room:${roomId}:queue`,
          track.uri
        );
        if (isInQueue) {
          return track;
        }

        await pubClient.sAdd(`room:${roomId}:queue`, track.uri);
        await pubClient.set(
          `room:${roomId}:queued_track:${track.uri}`,
          JSON.stringify(track)
        );
        return track;
      })
    );

    await writes;
    return await getQueue(roomId);
  } catch (e) {
    console.log("ERROR FROM data/djs/removeFromQueue", roomId, tracks);
    console.error(e);
    return [];
  }
}

export async function clearQueue(roomId: string) {
  try {
    await deleteMembersFromSet(
      `room:${roomId}:queue`,
      `room:${roomId}:queued_track`
    );
    await pubClient.unlink(`room:${roomId}:queue`);
    return [];
  } catch (e) {
    console.log("ERROR FROM data/djs/clearQueue", roomId);
    console.error(e);
    return [];
  }
}
