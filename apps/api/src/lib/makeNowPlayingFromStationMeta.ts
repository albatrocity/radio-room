import { RoomNowPlaying } from "../types/RoomNowPlaying";
import { Station } from "../types/Station";

function makeStationName(stationMeta?: Station) {
  return stationMeta?.title?.split("|")[0]?.trim();
}
function makeStationArtists(stationMeta?: Station) {
  return [
    {
      type: "artist" as const,
      name: stationMeta?.title?.split("|")[1]?.trim(),
    },
  ];
}
function makeStationAlbum(stationMeta?: Station) {
  return {
    album_type: "album" as const,
    name: stationMeta?.title?.split("|")[2]?.trim(),
  };
}

export default async function makeNowPlayingFromStationMeta(
  stationMeta?: Station
): Promise<RoomNowPlaying> {
  return {
    name: makeStationName(stationMeta),
    album: makeStationAlbum(stationMeta),
    type: "track",
    artists: makeStationArtists(stationMeta),
  };
}
