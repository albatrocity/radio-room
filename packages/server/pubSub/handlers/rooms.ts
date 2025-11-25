import { Server } from "socket.io"
import { PUBSUB_PLAYBACK_STATE_CHANGED } from "../../lib/constants"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import { getRoomPath } from "../../lib/getRoomPath"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"
import { AppContext } from "@repo/types"
import { createOperations } from "../../operations"
import { SystemEvents } from "../../lib/SystemEvents"

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

export default async function bindHandlers(io: Server, context: AppContext) {
  // Listen to new SystemEvents channels
  context.redis.subClient.pSubscribe(
    SystemEvents.getChannelName("roomDeleted"),
    (message, channel) => handleRoomDeleted({ io, message, channel, context }),
  )

  context.redis.subClient.pSubscribe(
    SystemEvents.getChannelName("roomSettingsUpdated"),
    (message, channel) => handleRoomSettingsUpdated({ io, message, channel, context }),
  )

  // PUBSUB_PLAYBACK_STATE_CHANGED still uses old channel (not migrated yet)
  context.redis.subClient.pSubscribe(PUBSUB_PLAYBACK_STATE_CHANGED, (message, channel) => {
    handlePlaybackStateChange({ io, message, channel, context })
  })
}

async function handleRoomDeleted({ io, message, channel }: ContextPubSubHandlerArgs) {
  const { roomId } = JSON.parse(message)
  io.to(getRoomPath(roomId)).emit("event", {
    type: "ROOM_DELETED",
    data: {
      roomId,
    },
  })
}

async function handlePlaybackStateChange({ io, message, context }: ContextPubSubHandlerArgs) {
  const { isPlaying, roomId } = JSON.parse(message)
  const newMessage = systemMessage(
    `Playback has been ${isPlaying ? "resumed" : "paused"}`,
    {
      type: "alert",
    },
  )
  sendMessage(io, roomId, newMessage, context)
}

async function handleRoomSettingsUpdated({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, room } = JSON.parse(message)

  await io.to(getRoomPath(roomId)).emit("event", {
    type: "ROOM_SETTINGS",
    data: {
      room,
    },
  })
}
