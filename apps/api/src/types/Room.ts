import { User } from "./User";
import { Station } from "./Station";
import { StationProtocol } from "./StationProtocol";
import { RoomNowPlaying } from "./RoomNowPlaying";

export type RoomError = {
  status: number;
  message: string;
};

export type Room = {
  id: string;
  creator: string;
  type: "jukebox" | "radio";
  title: string;
  fetchMeta: boolean;
  extraInfo: string | undefined;
  password: string | null;
  passwordRequired?: boolean;
  artwork?: string;
  enableSpotifyLogin: boolean;
  deputizeOnJoin: boolean;
  radioMetaUrl?: string;
  radioListenUrl?: string;
  radioProtocol?: StationProtocol;
  createdAt: string;
  spotifyError?: RoomError;
  radioError?: RoomError;
  lastRefreshedAt: string;
  announceNowPlaying?: boolean;
  announceUsernameChanges?: boolean;
  persistent?: boolean;
};

type Bool = "true" | "false";
export interface StoredRoom
  extends Omit<
    Room,
    | "fetchMeta"
    | "enableSpotifyLogin"
    | "deputizeOnJoin"
    | "spotifyError"
    | "radioError"
    | "announceNowPlaying"
    | "announceUsernameChanges"
    | "persistent"
  > {
  fetchMeta: Bool;
  enableSpotifyLogin: Bool;
  deputizeOnJoin: Bool;
  announceNowPlaying?: Bool;
  announceUsernameChanges?: Bool;
  persistent?: Bool;
  spotifyError?: string;
  radioError?: string;
}

export type RoomMeta = {
  release?: RoomNowPlaying;
  track?: string;
  artist?: string;
  album?: string;
  title?: string;
  bitrate?: number;
  dj?: User;
  lastUpdatedAt?: string;
  stationMeta?: Station;
};
export interface StoredRoomMeta
  extends Omit<RoomMeta, "stationMeta" | "release" | "dj"> {
  stationMeta: string;
  dj?: string;
  release?: string;
}

export type RoomSnapshot = {
  id: string;
  lastMessageTime: number;
  lastPlaylistItemTime: number;
};
