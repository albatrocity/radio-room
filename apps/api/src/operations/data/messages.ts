import { pubClient } from "../../lib/redisClients";
import { ChatMessage } from "../../types/ChatMessage";

export async function persistMessage(roomId: string, message: ChatMessage) {
  try {
    const messageString = JSON.stringify(message);
    const key = `room:${roomId}:messages`;
    const score = new Date(message.timestamp).getTime();
    return pubClient.zAdd(key, [{ score, value: messageString }]);
  } catch (e) {
    console.log("ERROR FROM data/messages/persistMessage", roomId, message);
    console.error(e);
  }
}

export async function getMessages(
  roomId: string,
  offset: number = 0,
  size: number = 50
) {
  try {
    const roomKey = `room:${roomId}:messages`;
    const roomExists = await pubClient.exists(roomKey);
    if (!roomExists) {
      return [];
    } else {
      const results = await pubClient.zRange(roomKey, offset, offset + size, {
        REV: true,
      });
      return results.map((m) => JSON.parse(m) as ChatMessage) || [];
    }
  } catch (e) {
    console.log("ERROR FROM data/messages/getMessages", roomId, offset, size);
    console.error(e);
    return [];
  }
}

export async function getMessagesSince(
  roomId: string,
  since: number = Date.now()
) {
  try {
    const sinceDate = new Date(since).getTime();
    const roomKey = `room:${roomId}:messages`;
    const roomExists = await pubClient.exists(roomKey);
    if (!roomExists) {
      return [];
    } else {
      const results = await pubClient.zRangeByScore(
        roomKey,
        sinceDate,
        Date.now()
      );
      return results.map((m) => JSON.parse(m) as ChatMessage) || [];
    }
  } catch (e) {
    console.log("ERROR FROM data/messages/getMessagesSince", roomId, since);
    console.error(e);
    return [];
  }
}

export async function clearMessages(roomId: string) {
  try {
    console.log("CLEARING MESSAGES", roomId);
    const roomKey = `room:${roomId}:messages`;
    return pubClient.unlink(roomKey);
  } catch (e) {
    console.log("ERROR FROM data/messages/clearMessages", roomId);
    console.error(e);
  }
}
