import { Server, Socket } from "socket.io";

import {
  djDeputizeUser,
  queueSong,
  searchSpotifyTrack,
  savePlaylist,
  getSavedTracks,
} from "../handlers/djHandlers";
import { SpotifyEntity } from "../types/SpotifyEntity";
import { User } from "../types/User";

export default function djController(socket: Socket, io: Server) {
  socket.on("dj deputize user", (userId: User["userId"]) =>
    djDeputizeUser({ socket, io }, userId)
  );

  socket.on("queue song", (uri: SpotifyEntity["uri"]) =>
    queueSong({ socket, io }, uri)
  );

  socket.on("search spotify track", (query: { query: string; options: any }) =>
    searchSpotifyTrack({ socket, io }, query)
  );

  socket.on(
    "get spotify saved tracks",
    (query: { query: string; options: any }) => getSavedTracks({ socket, io })
  );

  socket.on(
    "save playlist",
    ({ name, uris }: { name: string; uris: SpotifyEntity["uri"][] }) =>
      savePlaylist({ socket, io }, { name, uris })
  );
}
