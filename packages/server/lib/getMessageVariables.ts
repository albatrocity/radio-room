import { getQueue, getRoomPlaylist, getRoomUsers } from "../operations/data"
import { AppContext } from "@repo/types"

export default async function getMessageVariables({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}) {
  const users = await getRoomUsers({ context, roomId })
  const playlist = await getRoomPlaylist({ context, roomId })
  const nowPlaying = playlist[playlist.length - 1]
  const queue = await getQueue({ context, roomId })

  return {
    currentTrack: { ...nowPlaying, title: nowPlaying?.track },
    nowPlaying: nowPlaying?.title,
    listenerCount: users.filter(({ status }) => status == "listening").length,
    participantCount: users.filter(({ status }) => status == "participating").length,
    userCount: users.length,
    playlistCount: playlist.length,
    queueCount: queue.length,
  }
}
