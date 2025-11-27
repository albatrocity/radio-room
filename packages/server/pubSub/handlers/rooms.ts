import { Server } from "socket.io"
import { PUBSUB_PLAYBACK_STATE_CHANGED } from "../../lib/constants"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"
import { AppContext } from "@repo/types"

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

export default async function bindHandlers(io: Server, context: AppContext) {
  // NOTE: ROOM_DELETED and ROOM_SETTINGS_UPDATED are handled directly by SystemEvents
  // which emits to Socket.IO. No PubSub handler needed.

  // PUBSUB_PLAYBACK_STATE_CHANGED has a side effect (sends system message)
  context.redis.subClient.pSubscribe(PUBSUB_PLAYBACK_STATE_CHANGED, (message, channel) => {
    handlePlaybackStateChange({ io, message, channel, context })
  })
}

async function handlePlaybackStateChange({ io, message, context }: ContextPubSubHandlerArgs) {
  const { isPlaying, roomId } = JSON.parse(message)
  const newMessage = systemMessage(`Playback has been ${isPlaying ? "resumed" : "paused"}`, {
    type: "alert",
  })
  sendMessage(io, roomId, newMessage, context)
}
