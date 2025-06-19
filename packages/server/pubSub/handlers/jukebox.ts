import { Server } from "socket.io"
import { PUBSUB_ROOM_NOW_PLAYING_FETCHED, PUBSUB_PLAYLIST_ADDED } from "../../lib/constants"
import { getRoomPath } from "../../lib/getRoomPath"
import { QueueItem } from "@repo/types/Queue"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import { RoomMeta } from "@repo/types/Room"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"
import { AppContext } from "@repo/types"
import { createOperations } from "../../operations"

export default async function bindHandlers(io: Server, context: AppContext) {
  context.redis.subClient.pSubscribe(PUBSUB_ROOM_NOW_PLAYING_FETCHED, (message, channel) =>
    handleNowPlaying({ io, message, channel, context }),
  )
  context.redis.subClient.pSubscribe(PUBSUB_PLAYLIST_ADDED, (message, channel) =>
    handlePlaylistAdded({ io, message, channel, context }),
  )
}

type ContextPubSubHandlerArgs = PubSubHandlerArgs & { context: AppContext }

async function handleNowPlaying({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, nowPlaying, meta }: { nowPlaying: QueueItem; roomId: string; meta: RoomMeta } =
    JSON.parse(message)

  const operations = createOperations(context)
  const payload = await operations.rooms.makeJukeboxCurrentPayload({
    context,
    roomId,
    nowPlaying,
    meta,
  })
  io.to(getRoomPath(roomId)).emit("event", payload)

  const room = await operations.rooms.findRoom({ context, roomId })

  if (room?.announceNowPlaying && nowPlaying) {
    const msg = systemMessage(
      `Now playing: ${nowPlaying.track.title} ${
        nowPlaying.track.artists?.[0]?.title ? `by ${nowPlaying.track.artists[0].title}` : ""
      }`,
      "success",
    )
    sendMessage(io, roomId, msg)
  }
}

async function handlePlaylistAdded({ io, message, context }: ContextPubSubHandlerArgs) {
  const { roomId, track }: { track: QueueItem; roomId: string } = JSON.parse(message)
  io.to(getRoomPath(roomId)).emit("event", {
    type: "PLAYLIST_TRACK_ADDED",
    data: { track },
  })
}
