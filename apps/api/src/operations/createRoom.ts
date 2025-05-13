const { createHash } = require("crypto");

import { Room } from "../types/Room";

export function createRoomId({
  creator,
  type,
  createdAt,
}: Pick<Room, "creator" | "type"> & { createdAt: string }) {
  const hash = createHash("md5");
  hash.update(`${creator}${type}${createdAt}`);
  return String(hash.digest("hex"));
}

export function withDefaults(
  roomDetails: Pick<
    Room,
    | "title"
    | "creator"
    | "type"
    | "id"
    | "createdAt"
    | "lastRefreshedAt"
    | "radioMetaUrl"
    | "radioListenUrl"
    | "radioProtocol"
    | "deputizeOnJoin"
  >,
): Room {
  return {
    fetchMeta: true,
    extraInfo: undefined,
    password: null,
    enableSpotifyLogin: false,
    artwork: undefined,
    radioMetaUrl: undefined,
    announceNowPlaying: true,
    announceUsernameChanges: true,
    ...roomDetails,
    deputizeOnJoin: roomDetails.deputizeOnJoin || false,
  };
}
