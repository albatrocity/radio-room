import { Server } from "socket.io"
import { PUBSUB_ROOM_NOW_PLAYING_FETCHED, PUBSUB_PLAYLIST_ADDED } from "../../lib/constants"
import { subClient } from "../../lib/redisClients"
import getRoomPath from "../../lib/getRoomPath"
import { findRoom, makeJukeboxCurrentPayload } from "../../operations/data"
import { QueueItem } from "@repo/types/Queue"
import { PubSubHandlerArgs } from "@repo/types/PubSub"
import { RoomMeta } from "@repo/types/Room"
import systemMessage from "../../lib/systemMessage"
import sendMessage from "../../lib/sendMessage"

export default async function bindHandlers(io: Server) {
  subClient.pSubscribe(PUBSUB_ROOM_NOW_PLAYING_FETCHED, (message, channel) =>
    handleNowPlaying({ io, message, channel }),
  )
  subClient.pSubscribe(PUBSUB_PLAYLIST_ADDED, (message, channel) =>
    handlePlaylistAdded({ io, message, channel }),
  )
}

async function handleNowPlaying({ io, message, channel }: PubSubHandlerArgs) {
  const { roomId, nowPlaying, meta }: { nowPlaying: QueueItem; roomId: string; meta: RoomMeta } =
    JSON.parse(message)
  const payload = await makeJukeboxCurrentPayload(roomId, nowPlaying, meta)
  io.to(getRoomPath(roomId)).emit("event", payload)

  const room = await findRoom(roomId)

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

async function handlePlaylistAdded({ io, message }: PubSubHandlerArgs) {
  const { roomId, track }: { track: QueueItem; roomId: string } = JSON.parse(message)
  io.to(getRoomPath(roomId)).emit("event", {
    type: "PLAYLIST_TRACK_ADDED",
    data: { track },
  })
}
