import { PlaylistTrack } from "../types/PlaylistTrack";
import { RoomMeta } from "../types/Room";

export default function stationMetaToPlaylistTrack(
  meta: RoomMeta
): Partial<PlaylistTrack> {
  return {
    text: meta.title,
    spotifyData: null,
    timestamp: Date.now(),
    artist: meta.artist,
    album: meta.album,
    track: meta.track,
    dj: null,
  };
}
