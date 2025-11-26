import { Server } from "socket.io"
import { PUBSUB_PLAYLIST_ADDED } from "../../lib/constants"
import { getRoomPath } from "../../lib/getRoomPath"
import { QueueItem } from "@repo/types/Queue"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"
import { AppContext } from "@repo/types"
import { createOperations } from "../../operations"
import { SystemEvents } from "../../lib/SystemEvents"

export default async function bindHandlers(io: Server, context: AppContext) {
  // Listen to new SystemEvents channels
  context.redis.subClient.pSubscribe(
    SystemEvents.getChannelName("TRACK_CHANGED"),
    (message, channel) => handleNowPlaying({ io, message, channel, context }),
  )

  context.redis.subClient.pSubscribe(
    SystemEvents.getChannelName("MEDIA_SOURCE_STATUS_CHANGED"),
    (message, channel) => handleMediaSourceStatus({ io, message, channel, context }),
  )

  context.redis.subClient.pSubscribe(
    SystemEvents.getChannelName("PLAYLIST_TRACK_ADDED"),
    (message, channel) => handlePlaylistAdded({ io, message, channel, context }),
  )
}

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

async function handleNowPlaying({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, track }: { track: QueueItem; roomId: string } = JSON.parse(message)

  const operations = createOperations(context)

  // NOTE: Socket.IO emission is handled by SystemEvents directly.
  // This handler only handles additional side effects like announcements.

  const room = await operations.rooms.findRoom({ context, roomId })

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

async function handleMediaSourceStatus({ io, message }: ContextPubSubHandlerArgs) {
  const data: {
    roomId: string
    status: "online" | "offline" | "connecting" | "error"
    sourceType?: "jukebox" | "radio"
    bitrate?: number
    error?: string
  } = JSON.parse(message)

  // Forward media source status to frontend
  io.to(getRoomPath(data.roomId)).emit("event", {
    type: "MEDIA_SOURCE_STATUS_CHANGED",
    data,
  })
}

async function handlePlaylistAdded({ io, message }: ContextPubSubHandlerArgs) {
  const { roomId, track }: { track: QueueItem; roomId: string } = JSON.parse(message)
  io.to(getRoomPath(roomId)).emit("event", {
    type: "PLAYLIST_TRACK_ADDED",
    data: { roomId, track },
  })
}
