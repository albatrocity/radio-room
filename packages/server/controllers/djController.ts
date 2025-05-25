import { Server, Socket } from "socket.io"

import { djDeputizeUser, queueSong, searchForTrack, savePlaylist } from "../handlers/djHandlers"
import { User } from "@repo/types/User"
import { QueueItem } from "@repo/types/Queue"

export default function djController(socket: Socket, io: Server) {
  socket.on("dj deputize user", (userId: User["userId"]) => djDeputizeUser({ socket, io }, userId))

  socket.on("queue song", (uri: QueueItem["track"]["id"]) => queueSong({ socket, io }, uri))

  socket.on("search spotify track", (query: { query: string; options: any }) =>
    searchForTrack({ socket, io }, query),
  )

  socket.on(
    "save playlist",
    ({ name, trackIds }: { name: string; trackIds: QueueItem["track"]["id"] }) =>
      savePlaylist({ socket, io }, { name, trackIds }),
  )
}
