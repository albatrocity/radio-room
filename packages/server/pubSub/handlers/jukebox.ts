import { Server } from "socket.io"
import { PUBSUB_PLAYLIST_ADDED } from "../../lib/constants"
import { getRoomPath } from "../../lib/getRoomPath"
import { QueueItem } from "@repo/types/Queue"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import { RoomMeta } from "@repo/types/Room"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"
import { AppContext } from "@repo/types"
import { createOperations } from "../../operations"
import { SystemEvents } from "../../lib/SystemEvents"

export default async function bindHandlers(io: Server, context: AppContext) {
  // Listen to new SystemEvents channels
  context.redis.subClient.pSubscribe(
    SystemEvents.getChannelName("trackChanged"),
    (message, channel) => handleNowPlaying({ io, message, channel, context }),
  )
  
  // PUBSUB_PLAYLIST_ADDED still uses old channel (not migrated yet)
  context.redis.subClient.pSubscribe(PUBSUB_PLAYLIST_ADDED, (message, channel) =>
    handlePlaylistAdded({ io, message, channel, context }),
  )
}

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

async function handleNowPlaying({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, track, roomMeta }: { track: QueueItem; roomId: string; roomMeta: RoomMeta } =
    JSON.parse(message)

  const operations = createOperations(context)
  const payload = await operations.rooms.makeJukeboxCurrentPayload({
    context,
    roomId,
    nowPlaying: track,
    meta: roomMeta,
  })
  io.to(getRoomPath(roomId)).emit("event", payload)

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

async function handlePlaylistAdded({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, track }: { track: QueueItem; roomId: string } = JSON.parse(message)
  io.to(getRoomPath(roomId)).emit("event", {
    type: "PLAYLIST_TRACK_ADDED",
    data: { track },
  })
}
