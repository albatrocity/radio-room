import { Factory } from "fishery"
import { Room } from "@repo/types/Room"

export const roomFactory = Factory.define<Room>(({ sequence }) => ({
  id: `room-${sequence}`,
  title: `Room ${sequence}`,
  creator: `user-${sequence}`,
  type: "radio",
  radioMetaUrl: `http://example.com/meta/${sequence}`,
  radioListenUrl: `http://example.com/listen/${sequence}`,
  radioProtocol: "shoutcastv2",
  fetchMeta: true,
  extraInfo: `Extra info for room ${sequence}`,
  password: null,
  enableSpotifyLogin: false,
  deputizeOnJoin: false,
  createdAt: new Date().toISOString(),
  lastRefreshedAt: new Date().toISOString(),
  announceNowPlaying: false,
  announceUsernameChanges: false,
  persistent: false,
}))
