import { compact } from "remeda";
import { pubClient } from "../../lib/redisClients";
import { StoredUser, User } from "../../types/User";
import { mapUserBooleans, writeJsonToHset } from "./utils";
import removeStoredUserSpotifyTokens from "../spotify/removeStoredUserSpotifyTokens";
import { PUBSUB_USER_SPOTIFY_AUTHENTICATION_STATUS } from "../../lib/constants";

export async function addTypingUser(roomId: string, userId: string) {
  try {
    if (!roomId || !userId) {
      return null;
    }
    return await pubClient.sAdd(`room:${roomId}:typing_users`, userId);
  } catch (e) {
    console.error(e);
    return null;
  }
}
export async function removeTypingUser(roomId: string, userId: string) {
  try {
    if (!roomId || !userId) {
      return null;
    }
    return await pubClient.sRem(`room:${roomId}:typing_users`, userId);
  } catch (e) {
    console.error(e);
    return null;
  }
}
export async function getTypingUsers(roomId: string) {
  try {
    const users = await pubClient.sMembers(`room:${roomId}:typing_users`);
    const reads = users.map(async (userId) => {
      const userData = await getUser(userId);
      if (!userData) {
        return null;
      }
      return userData;
    });
    const allUsers = await Promise.all(reads);
    return compact(allUsers);
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function addOnlineUser(roomId: string, userId: string) {
  try {
    return await pubClient.sAdd(`room:${roomId}:online_users`, userId);
  } catch (e) {
    console.log("ERROR FROM data/users/addOnlineUser", roomId, userId);
    console.error(e);
    return null;
  }
}
export async function removeOnlineUser(roomId: string, userId: string) {
  try {
    if (userId) {
      return await pubClient.sRem(`room:${roomId}:online_users`, userId);
    }
    return null;
  } catch (e) {
    console.log("ERROR FROM data/users/removeOnlineUser", roomId, userId);
    console.error(e);
    return null;
  }
}

export async function incrementRoomUsers(roomId: string) {
  try {
    return await pubClient.incr(`room:${roomId}:users`);
  } catch (e) {
    console.log("ERROR FROM data/users/incrementRoomUsers", roomId);
    console.error(e);
    return null;
  }
}
export async function decrementRoomUsers(roomId: string) {
  try {
    return await pubClient.decr(`room:${roomId}:users`);
  } catch (e) {
    console.log("ERROR FROM data/users/decrementRoomUsers", roomId);
    console.error(e);
    return null;
  }
}

export async function getRoomUsers(roomId: string) {
  try {
    const users = await pubClient.sMembers(`room:${roomId}:online_users`);
    const reads = users.map(async (userId) => {
      const userData = await getUser(userId);
      if (!userData) {
        return null;
      }
      return userData;
    });
    const allUsers = await Promise.all(reads);
    return compact(allUsers);
  } catch (e) {
    console.log("ERROR FROM data/users/getRoomUsers", roomId);
    console.error(e);
    return [];
  }
}

export async function getRoomUsersCount(roomId: string) {
  try {
    const users = await pubClient.sMembers(`room:${roomId}:online_users`);
    return users.length;
  } catch (e) {
    console.log("ERROR FROM data/users/getRoomUsersCount", roomId);
    console.error(e);
    return 0;
  }
}

export async function saveUser(userId: string, attributes: Partial<User>) {
  try {
    return await writeJsonToHset(`user:${userId}`, attributes);
  } catch (e) {
    console.log("ERROR FROM data/users/persistUser", userId, attributes);
    console.error(e);
    return null;
  }
}

export async function getUser(userId: string) {
  try {
    const userAttributes = await pubClient.hGetAll(`user:${userId}`);
    if (!userAttributes) {
      return null;
    }
    return mapUserBooleans(userAttributes as unknown as StoredUser);
  } catch (e) {
    console.log("ERROR FROM data/users/getUser", userId);
    console.error(e);
    return null;
  }
}

export async function deleteUser(userId: string) {
  try {
    return await pubClient.unlink(`user:${userId}`);
  } catch (e) {
    console.log("ERROR FROM data/users/deleteUser", userId);
    console.error(e);
    return null;
  }
}

export async function updateUserAttributes(
  userId: string,
  attributes: Partial<User>,
  roomId?: string
) {
  try {
    await saveUser(userId, attributes);
    const users = roomId ? await getRoomUsers(roomId) : [];
    const user = users.find((u) => u?.userId === userId);
    return { user, users };
  } catch (e) {
    console.log(
      "ERROR FROM data/users/updateUserAttributes",
      userId,
      attributes,
      roomId
    );
    console.error(e);
    return null;
  }
}

export async function disconnectFromSpotify(userId: string) {
  // removes user's spotify access token from redis
  const { error } = await removeStoredUserSpotifyTokens(userId);
  await pubClient.publish(
    PUBSUB_USER_SPOTIFY_AUTHENTICATION_STATUS,
    JSON.stringify({ userId, isAuthenticated: error ? true : false })
  );
}

export async function expireUserIn(userId: string, ms: number) {
  await pubClient.pExpire(`user:${userId}`, ms);
  await pubClient.pExpire(`user:${userId}:rooms`, ms);
}

export async function persistUser(userId: string) {
  await pubClient.persist(`user:${userId}`);
  await pubClient.persist(`user:${userId}:rooms`);
}
