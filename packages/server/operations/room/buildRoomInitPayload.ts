import { AppContext, GameSession, Room, toAdminAssignablePersonas } from "@repo/types"
import type { MyMediaShelf } from "@repo/types"
import type { PersonaService } from "../../services/PersonaService"
import {
  getAllPluginConfigs,
  getAllRoomReactions,
  getMessages,
  getNormalizedQueueSplit,
  getQueue,
  getQueueWithDispatched,
  getRoomCurrent,
  getRoomPlaylist,
} from "../data"
import {
  getStreamHealthStatus,
  getWebrtcExperimentalStreamHealthStatus,
} from "./handleStreamHealth"
import { isAppControlledPlayback, isHybridRadioRoom } from "../../lib/roomTypeHelpers"
import { loadPollInitData } from "../polls/loadPollSnapshot"

/** Most recent playlist rows included in INIT; older history loads via drawers / since-queries. */
export const INIT_PLAYLIST_COUNT = 200

export type RoomInitPayload = {
  messages: Awaited<ReturnType<typeof getMessages>>
  playlist: Awaited<ReturnType<typeof getRoomPlaylist>>
  meta: Awaited<ReturnType<typeof getRoomCurrent>>
  reactions: Awaited<ReturnType<typeof getAllRoomReactions>>
  pluginConfigs: Awaited<ReturnType<typeof getAllPluginConfigs>>
  queue: Awaited<ReturnType<typeof getQueue>>
  splitKey: string | null
  streamHealthStatus: Awaited<ReturnType<typeof getStreamHealthStatus>> | null
  webrtcStreamHealthStatus: Awaited<
    ReturnType<typeof getWebrtcExperimentalStreamHealthStatus>
  > | null
  activeGameSession: GameSession | null
  assignablePersonas: ReturnType<typeof toAdminAssignablePersonas>
  accessToken: string | undefined
  pollInit: Awaited<ReturnType<typeof loadPollInitData>>
  effectiveMetadataSourceIds?: string[]
  browseableSourceIds?: string[]
  browseSourceCapabilities?: Record<
    string,
    { entryMode: "index" | "search"; albumSearch: boolean }
  >
  myMedia?: MyMediaShelf[]
}

/**
 * Parallel Redis/API reads for the LOGIN INIT payload.
 * Keeps AuthService.login focused on auth + user assembly.
 */
export async function buildRoomInitPayload(params: {
  context: AppContext
  room: Room
  roomId: string
  userId: string
  isAdmin: boolean
}): Promise<RoomInitPayload> {
  const { context, room, roomId, userId, isAdmin } = params
  const appControlled = isAppControlledPlayback(room)

  const [
    messages,
    playlist,
    meta,
    reactions,
    pluginConfigs,
    queue,
    splitKey,
    streamHealthStatus,
    webrtcStreamHealthStatus,
    activeGameSession,
    assignablePersonas,
    accessToken,
    pollInit,
    metadataAccess,
  ] = await Promise.all([
    getMessages({ context, roomId, offset: 0, size: 100 }),
    getRoomPlaylist({
      context,
      roomId,
      offset: -INIT_PLAYLIST_COUNT,
      count: -1,
    }),
    getRoomCurrent({ context, roomId }),
    getAllRoomReactions({ context, roomId }),
    getAllPluginConfigs({ context, roomId }),
    appControlled
      ? getQueueWithDispatched({ context, roomId })
      : getQueue({ context, roomId }),
    appControlled ? getNormalizedQueueSplit({ context, roomId }) : Promise.resolve(null),
    room.type === "live" ? getStreamHealthStatus(context, roomId) : Promise.resolve(null),
    isHybridRadioRoom(room)
      ? getWebrtcExperimentalStreamHealthStatus(context, roomId)
      : Promise.resolve(null),
    (async (): Promise<GameSession | null> => {
      try {
        if (!context.gameSessions) return null
        return await context.gameSessions.getActiveSession(roomId)
      } catch (err) {
        console.error("[buildRoomInitPayload] Failed to load active game session:", err)
        return null
      }
    })(),
    (async (): Promise<ReturnType<typeof toAdminAssignablePersonas>> => {
      const personaSvc = context.personas as PersonaService | undefined
      if (!personaSvc) return []
      try {
        const definitions = await personaSvc.getRoomDefinitions(roomId)
        return toAdminAssignablePersonas(definitions)
      } catch (err) {
        console.error("[buildRoomInitPayload] Failed to load assignable personas:", err)
        return []
      }
    })(),
    (async (): Promise<string | undefined> => {
      const primaryMetadataSource = room.metadataSourceIds?.[0]
      if (!isAdmin || !primaryMetadataSource || !context.data?.getUserServiceAuth) {
        return undefined
      }
      try {
        const auth = await context.data.getUserServiceAuth({
          userId,
          serviceName: primaryMetadataSource,
        })
        console.log(`Retrieved ${primaryMetadataSource} access token for room creator ${userId}`)
        return auth?.accessToken
      } catch (error) {
        console.error(`Failed to retrieve access token for room creator ${userId}:`, error)
        return undefined
      }
    })(),
    loadPollInitData({ context, roomId, userId }),
    (async (): Promise<{
      effectiveMetadataSourceIds?: string[]
      browseableSourceIds?: string[]
      browseSourceCapabilities?: Record<
        string,
        { entryMode: "index" | "search"; albumSearch: boolean }
      >
      myMedia?: MyMediaShelf[]
    }> => {
      if (!context.metadataSourceAccess) return {}
      try {
        const { AdapterService } = await import("../../services/AdapterService")
        const { getEffectiveMetadataSources } = await import("../dj/browseCatalog")
        const adapterService = new AdapterService(context)
        const data = await getEffectiveMetadataSources({
          context,
          adapterService,
          roomId,
          userId,
        })
        return {
          effectiveMetadataSourceIds: data.metadataSourceIds,
          browseableSourceIds: data.browseableSourceIds,
          browseSourceCapabilities: data.browseSourceCapabilities,
          myMedia: data.myMedia,
        }
      } catch (err) {
        console.error("[buildRoomInitPayload] Failed to load effective metadata sources:", err)
        return {}
      }
    })(),
  ])

  return {
    messages,
    playlist,
    meta,
    reactions,
    pluginConfigs,
    queue,
    splitKey,
    streamHealthStatus,
    webrtcStreamHealthStatus,
    activeGameSession,
    assignablePersonas,
    accessToken,
    pollInit,
    ...metadataAccess,
  }
}
