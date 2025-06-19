import { filter, isTruthy } from "remeda"
import { AppContext } from "../../lib/context"
import { StoredUser, User } from "@repo/types/User"
import { mapUserBooleans, writeJsonToHset } from "./utils"
// import { PUBSUB_USER_SPOTIFY_AUTHENTICATION_STATUS } from "../../lib/constants"

type AddTypingUserParams = {
  context: AppContext
  roomId: string
  userId: string
}

export async function addTypingUser({ context, roomId, userId }: AddTypingUserParams) {
  try {
    if (!roomId || !userId) {
      return null
    }
    return await context.redis.pubClient.sAdd(`room:${roomId}:typing_users`, userId)
  } catch (e) {
    console.error(e)
    return null
  }
}

type RemoveTypingUserParams = {
  context: AppContext
  roomId: string
  userId: string
}

export async function removeTypingUser({ context, roomId, userId }: RemoveTypingUserParams) {
  try {
    if (!roomId || !userId) {
      return null
    }
    return await context.redis.pubClient.sRem(`room:${roomId}:typing_users`, userId)
  } catch (e) {
    console.error(e)
    return null
  }
}

type GetTypingUsersParams = {
  context: AppContext
  roomId: string
}

export async function getTypingUsers({ context, roomId }: GetTypingUsersParams) {
  try {
    const users = await context.redis.pubClient.sMembers(`room:${roomId}:typing_users`)
    const reads = users.map(async (userId) => {
      const userData = await getUser({ context, userId })
      if (!userData) {
        return null
      }
      return userData
    })
    const allUsers = await Promise.all(reads)
    return filter(allUsers, isTruthy)
  } catch (e) {
    console.error(e)
    return []
  }
}

type AddOnlineUserParams = {
  context: AppContext
  roomId: string
  userId: string
}

export async function addOnlineUser({ context, roomId, userId }: AddOnlineUserParams) {
  try {
    return await context.redis.pubClient.sAdd(`room:${roomId}:online_users`, userId)
  } catch (e) {
    console.log("ERROR FROM data/users/addOnlineUser", roomId, userId)
    console.error(e)
    return null
  }
}

type RemoveOnlineUserParams = {
  context: AppContext
  roomId: string
  userId: string
}

export async function removeOnlineUser({ context, roomId, userId }: RemoveOnlineUserParams) {
  try {
    if (userId) {
      return await context.redis.pubClient.sRem(`room:${roomId}:online_users`, userId)
    }
    return null
  } catch (e) {
    console.log("ERROR FROM data/users/removeOnlineUser", roomId, userId)
    console.error(e)
    return null
  }
}

type IncrementRoomUsersParams = {
  context: AppContext
  roomId: string
}

export async function incrementRoomUsers({ context, roomId }: IncrementRoomUsersParams) {
  try {
    return await context.redis.pubClient.incr(`room:${roomId}:users`)
  } catch (e) {
    console.log("ERROR FROM data/users/incrementRoomUsers", roomId)
    console.error(e)
    return null
  }
}

type DecrementRoomUsersParams = {
  context: AppContext
  roomId: string
}

export async function decrementRoomUsers({ context, roomId }: DecrementRoomUsersParams) {
  try {
    return await context.redis.pubClient.decr(`room:${roomId}:users`)
  } catch (e) {
    console.log("ERROR FROM data/users/decrementRoomUsers", roomId)
    console.error(e)
    return null
  }
}

type GetRoomUsersParams = {
  context: AppContext
  roomId: string
}

export async function getRoomUsers({ context, roomId }: GetRoomUsersParams) {
  try {
    const users = await context.redis.pubClient.sMembers(`room:${roomId}:online_users`)
    const reads: Promise<User>[] = users.map(async (userId: string) => {
      const userData = await getUser({ context, userId })
      if (!userData) {
        return null
      }
      return userData
    })
    const allUsers = await Promise.all(reads)
    return filter(allUsers, isTruthy)
  } catch (e) {
    console.log("ERROR FROM data/users/getRoomUsers", roomId)
    console.error(e)
    return []
  }
}

type GetRoomUsersCountParams = {
  context: AppContext
  roomId: string
}

export async function getRoomUsersCount({ context, roomId }: GetRoomUsersCountParams) {
  try {
    const users = await context.redis.pubClient.sMembers(`room:${roomId}:online_users`)
    return users.length
  } catch (e) {
    console.log("ERROR FROM data/users/getRoomUsersCount", roomId)
    console.error(e)
    return 0
  }
}

type SaveUserParams = {
  context: AppContext
  userId: string
  attributes: Partial<User>
}

export async function saveUser({ context, userId, attributes }: SaveUserParams) {
  try {
    return await writeJsonToHset(`user:${userId}`, attributes, context)
  } catch (e) {
    console.log("ERROR FROM data/users/persistUser", userId, attributes)
    console.error(e)
    return null
  }
}

type GetUserParams = {
  context: AppContext
  userId: string
}

export async function getUser({ context, userId }: GetUserParams): Promise<User | null> {
  try {
    const userAttributes = await context.redis.pubClient.hGetAll(`user:${userId}`)
    if (!userAttributes) {
      return null
    }
    return mapUserBooleans(userAttributes as unknown as StoredUser)
  } catch (e) {
    console.log("ERROR FROM data/users/getUser", userId)
    console.error(e)
    return null
  }
}

type DeleteUserParams = {
  context: AppContext
  userId: string
}

export async function deleteUser({ context, userId }: DeleteUserParams) {
  try {
    return await context.redis.pubClient.unlink(`user:${userId}`)
  } catch (e) {
    console.log("ERROR FROM data/users/deleteUser", userId)
    console.error(e)
    return null
  }
}

type UpdateUserAttributesParams = {
  context: AppContext
  userId: string
  attributes: Partial<User>
  roomId?: string
}

export async function updateUserAttributes({
  context,
  userId,
  attributes,
  roomId,
}: UpdateUserAttributesParams) {
  try {
    await saveUser({ context, userId, attributes })
    const users = roomId ? await getRoomUsers({ context, roomId }) : []
    const user = users.find((u) => u?.userId === userId)
    return { user, users }
  } catch (e) {
    console.log("ERROR FROM data/users/updateUserAttributes", userId, attributes, roomId)
    console.error(e)
    return { user: null, users: [] }
  }
}

// TODO: Disconnect from MediaSource method
// export async function disconnectFromSpotify(userId: string) {
//   // removes user's spotify access token from redis
//   const { error } = await removeStoredUserSpotifyTokens(userId)
//   await pubClient.publish(
//     PUBSUB_USER_SPOTIFY_AUTHENTICATION_STATUS,
//     JSON.stringify({ userId, isAuthenticated: error ? true : false }),
//   )
// }

type ExpireUserInParams = {
  context: AppContext
  userId: string
  ms: number
}

export async function expireUserIn({ context, userId, ms }: ExpireUserInParams) {
  await context.redis.pubClient.pExpire(`user:${userId}`, ms)
  await context.redis.pubClient.pExpire(`user:${userId}:rooms`, ms)
}

type PersistUserParams = {
  context: AppContext
  userId: string
}

export async function persistUser({ context, userId }: PersistUserParams) {
  await context.redis.pubClient.persist(`user:${userId}`)
  await context.redis.pubClient.persist(`user:${userId}:rooms`)
}
