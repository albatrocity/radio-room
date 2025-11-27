import { Server } from "socket.io"
import { QueueItem } from "@repo/types/Queue"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"
import { AppContext } from "@repo/types"
import { createOperations } from "../../operations"
import { SystemEvents } from "../../lib/SystemEvents"

export default async function bindHandlers(io: Server, context: AppContext) {
  // NOTE: TRACK_CHANGED, MEDIA_SOURCE_STATUS_CHANGED, and PLAYLIST_TRACK_ADDED
  // are emitted directly to Socket.IO by SystemEvents.
  // This handler only listens for TRACK_CHANGED to handle the "announce now playing" side effect.

  context.redis.subClient.pSubscribe(
    SystemEvents.getChannelName("TRACK_CHANGED"),
    (message, channel) => handleNowPlaying({ io, message, channel, context }),
  )
}

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

async function handleNowPlaying({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, track }: { track: QueueItem; roomId: string } = JSON.parse(message)

  const operations = createOperations(context)
  const room = await operations.rooms.findRoom({ context, roomId })

  // Only send "Now playing" announcement if the room has it enabled
  if (room?.announceNowPlaying && track) {
    const msg = systemMessage(
      `Now playing: ${track.track.title} ${
        track.track.artists?.[0]?.title ? `by ${track.track.artists[0].title}` : ""
      }`,
      { type: "success" },
    )
    sendMessage(io, roomId, msg, context)
  }
}
