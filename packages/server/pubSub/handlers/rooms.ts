import { Server } from "socket.io"
import {
  PUBSUB_ROOM_DELETED,
  PUBSUB_ROOM_SETTINGS_UPDATED,
  PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED,
} from "../../lib/constants"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import getRoomPath from "../../lib/getRoomPath"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"
import { AppContext } from "../../lib/context"
import { createOperations } from "../../operations"

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

export default async function bindHandlers(io: Server, context: AppContext) {
  context.redis.subClient.pSubscribe(PUBSUB_ROOM_DELETED, (message, channel) =>
    handleRoomDeleted({ io, message, channel, context }),
  )

  context.redis.subClient.pSubscribe(PUBSUB_SPOTIFY_PLAYBACK_STATE_CHANGED, (message, channel) => {
    handlePlaybackStateChange({ io, message, channel, context })
  })

  context.redis.subClient.pSubscribe(PUBSUB_ROOM_SETTINGS_UPDATED, (message, channel) => {
    handleRoomSettingsUpdated({ io, message, channel, context })
  })
}

async function handleRoomDeleted({ io, message, channel }: ContextPubSubHandlerArgs) {
  const roomId = message
  io.to(getRoomPath(roomId)).emit("event", {
    type: "ROOM_DELETED",
    data: {
      roomId,
    },
  })
}

async function handlePlaybackStateChange({ io, message }: ContextPubSubHandlerArgs) {
  const { isPlaying, roomId } = JSON.parse(message)
  const newMessage = systemMessage(
    `Spotify playback has been ${isPlaying ? "resumed" : "paused"}`,
    {
      type: "alert",
    },
  )
  sendMessage(io, roomId, newMessage)
}

async function handleRoomSettingsUpdated({ io, message, context }: ContextPubSubHandlerArgs) {
  const roomId = message
  const operations = createOperations(context)
  const room = await operations.rooms.findRoom({ context, roomId })

  await io.to(getRoomPath(roomId)).emit("event", {
    type: "ROOM_SETTINGS",
    data: {
      room,
    },
  })
}
