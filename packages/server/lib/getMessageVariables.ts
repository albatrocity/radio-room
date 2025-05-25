import { getQueue, getRoomPlaylist, getRoomUsers } from "../operations/data";

export default async function getMessageVariables(roomId: string) {
  const users = await getRoomUsers(roomId);
  const playlist = await getRoomPlaylist(roomId);
  const nowPlaying = playlist[playlist.length - 1];
  const queue = await getQueue(roomId);

  return {
    currentTrack: { ...nowPlaying, title: nowPlaying?.track },
    nowPlaying: nowPlaying?.text,
    listenerCount: users.filter(({ status }) => status == "listening").length,
    participantCount: users.filter(({ status }) => status == "participating")
      .length,
    userCount: users.length,
    playlistCount: playlist.length,
    queueCount: queue.length,
  };
}
