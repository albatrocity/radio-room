import { AppContext } from "@repo/types"

export async function addAdmin({
  roomId,
  userId,
  context,
}: {
  roomId: string
  userId: string
  context: AppContext
}) {
  try {
    return context.redis.pubClient.sAdd(`room:${roomId}:admins`, userId)
  } catch (e) {
    console.log("ERROR FROM data/admins/addAdmin", roomId, userId)
    console.error(e)
    return null
  }
}

export async function removeAdmin({
  roomId,
  userId,
  context,
}: {
  roomId: string
  userId: string
  context: AppContext
}) {
  try {
    if (userId) {
      return context.redis.pubClient.sRem(`room:${roomId}:admins`, userId)
    }
    return null
  } catch (e) {
    console.log("ERROR FROM data/admins/removeAdmin", roomId, userId)
    console.error(e)
    return null
  }
}

export async function getAdmins({ roomId, context }: { roomId: string; context: AppContext }) {
  try {
    return context.redis.pubClient.sMembers(`room:${roomId}:admins`)
  } catch (e) {
    console.log("ERROR FROM data/admins/getAdmins", roomId)
    console.error(e)
    return []
  }
}

export async function isAdminMember({
  roomId,
  userId,
  context,
}: {
  roomId: string
  userId: string
  context: AppContext
}) {
  try {
    return context.redis.pubClient.sIsMember(`room:${roomId}:admins`, userId)
  } catch (e) {
    console.log("ERROR FROM data/admins/isAdminMember", roomId)
    console.error(e)
    return false
  }
}
