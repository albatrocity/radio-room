import { ChatMessage } from "@repo/types/ChatMessage"
import { AppContext } from "../../lib/context"

export async function persistMessage({
  roomId,
  message,
  context,
}: {
  roomId: string
  message: ChatMessage
  context: AppContext
}) {
  try {
    const messageString = JSON.stringify(message)
    const key = `room:${roomId}:messages`
    const score = new Date(message.timestamp).getTime()
    return context.redis.pubClient.zAdd(key, [{ score, value: messageString }])
  } catch (e) {
    console.log("ERROR FROM data/messages/persistMessage", roomId, message)
    console.error(e)
  }
}

export async function getMessages({
  roomId,
  offset = 0,
  size = 50,
  context,
}: {
  roomId: string
  offset: number
  size: number
  context: AppContext
}) {
  try {
    const roomKey = `room:${roomId}:messages`
    const roomExists = await context.redis.pubClient.exists(roomKey)
    if (!roomExists) {
      return []
    } else {
      const results = await context.redis.pubClient.zRange(roomKey, offset, offset + size, {
        REV: true,
      })
      return results.map((m) => JSON.parse(m) as ChatMessage) || []
    }
  } catch (e) {
    console.log("ERROR FROM data/messages/getMessages", roomId, offset, size)
    console.error(e)
    return []
  }
}

export async function getMessagesSince({
  roomId,
  since = Date.now(),
  context,
}: {
  roomId: string
  since: number
  context: AppContext
}) {
  try {
    const sinceDate = new Date(since).getTime()
    const roomKey = `room:${roomId}:messages`
    const roomExists = await context.redis.pubClient.exists(roomKey)
    if (!roomExists) {
      return []
    } else {
      const results = await context.redis.pubClient.zRangeByScore(roomKey, sinceDate, Date.now())
      return results.map((m) => JSON.parse(m) as ChatMessage) || []
    }
  } catch (e) {
    console.log("ERROR FROM data/messages/getMessagesSince", roomId, since)
    console.error(e)
    return []
  }
}

export async function clearMessages({ roomId, context }: { roomId: string; context: AppContext }) {
  try {
    console.log("CLEARING MESSAGES", roomId)
    const roomKey = `room:${roomId}:messages`
    return context.redis.pubClient.unlink(roomKey)
  } catch (e) {
    console.log("ERROR FROM data/messages/clearMessages", roomId)
    console.error(e)
  }
}
