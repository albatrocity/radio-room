import { marsEggSellbackValue } from "@repo/plugin-item-shops/mars-egg-sellback"
import type {
  GameAttributeName,
  GameSession,
  GameStateModifier,
  UserGameState,
} from "@repo/types/GameSession"
import type { InventoryItem, ItemDefinition } from "@repo/types/Inventory"
import type { QueueItem } from "@repo/types/Queue"
import type { RoomMeta } from "@repo/types/Room"
import type { User } from "@repo/types/User"
import type { BridgeSnapshot } from "./types.js"

/** Align with `apps/game-studio/src/studio/buildSessionConfig.ts` (`maxInventorySlots` default). */
const DEFAULT_MAX_INVENTORY_SLOTS = 3

/** Mirrors `packages/server/lib/getRoomPath`. */
export function roomSocketPath(roomId: string): string {
  return `/rooms/${roomId}`
}

/** Game Studio connects here to receive Room UI actions forwarded from the bridge. */
export function studioControlRoomPath(roomId: string): string {
  return `/studio-control/${roomId}`
}

export function resolveBridgeUser(
  snap: BridgeSnapshot,
  incomingUserId?: string,
  incomingUsername?: string,
): User {
  if (incomingUserId) {
    const u = snap.users.find((x) => x.userId === incomingUserId)
    if (u) return { ...u, status: u.status ?? "participating" }
  }
  if (incomingUsername) {
    const u = snap.users.find((x) => x.username === incomingUsername)
    if (u) return { ...u, status: u.status ?? "participating" }
  }
  if (snap.users.length > 0) {
    const u = snap.users[0]!
    return { ...u, status: u.status ?? "participating" }
  }
  return {
    userId: "studio-bridge-empty",
    username: "Add a user in Game Studio",
    status: "listening",
  }
}

export function buildRoomGameStateSnapshot(snap: BridgeSnapshot): {
  sessionId: string | null
  modifiersByUserId: Record<string, GameStateModifier[]>
} {
  const sessionId = snap.activeSession?.id ?? null
  const modifiersByUserId: Record<string, GameStateModifier[]> = {}
  for (const [uid, st] of Object.entries(snap.userStates)) {
    const mods = st.modifiers ?? []
    if (mods.length > 0) modifiersByUserId[uid] = mods
  }
  return { sessionId, modifiersByUserId }
}

/**
 * Mirror production `handleRoomNowPlayingData` / `makeJukeboxCurrentPayload`: `NowPlayingTrack`
 * reads `meta.track`, `meta.title`, `meta.artist`, `meta.album` — not only `nowPlaying`.
 */
function metaDisplayStringsFromQueueHead(
  head: QueueItem | undefined,
): Pick<RoomMeta, "title" | "track" | "artist" | "album"> {
  if (!head?.track) return {}
  const t = head.track
  return {
    title: t.title,
    track: t.title,
    artist: t.artists?.map((a) => a.title).join(", ") ?? undefined,
    album: t.album?.title,
  }
}

/** INIT / TRACK_CHANGED: mirror jukebox “current track” from sandbox queue head so Now Playing is not empty in bridge preview. */
export function buildRoomMeta(snap: BridgeSnapshot): Partial<RoomMeta> {
  const head = snap.queue[0]
  return {
    stationMeta: { bitrate: "" },
    nowPlaying: head ?? null,
    ...metaDisplayStringsFromQueueHead(head),
  }
}

export function buildUserGameStatePayload(snap: BridgeSnapshot, userId: string) {
  const maxSlots = snap.activeSession?.config.maxInventorySlots ?? DEFAULT_MAX_INVENTORY_SLOTS
  const session = snap.activeSession
  const state = snap.userStates[userId] ?? null
  const rawItems = snap.inventories[userId] ?? []
  const currentShopInstance = snap.shoppingByUser[userId] ?? null

  const defById = new Map<string, ItemDefinition>(snap.itemDefinitions.map((d) => [d.id, d]))
  const items: InventoryItem[] =
    session && rawItems.length > 0
      ? rawItems.map((item) => {
          const def = defById.get(item.definitionId)
          if (def?.sourcePlugin === "item-shops" && def.shortId === "mars-egg") {
            return { ...item, sellbackValue: marsEggSellbackValue(item, def) }
          }
          return item
        })
      : rawItems

  return {
    session,
    state,
    inventory: session
      ? {
          userId,
          items,
          maxSlots,
        }
      : null,
    itemDefinitions: snap.itemDefinitions,
    currentShopInstance,
  }
}

const EMPTY_ATTRS = {} as Record<GameAttributeName, number>

/** Admin tab: all users in the bridge snapshot with session-scoped state/inventory. */
export function buildAllListenerGameStatesPayload(snap: BridgeSnapshot) {
  const session = snap.activeSession
  const maxSlots = session?.config.maxInventorySlots ?? DEFAULT_MAX_INVENTORY_SLOTS
  if (!session) {
    return {
      session: null as GameSession | null,
      listeners: [] as Array<{
        userId: string
        username: string
        state: UserGameState
        inventory: { userId: string; items: InventoryItem[]; maxSlots: number }
      }>,
      itemDefinitions: snap.itemDefinitions,
    }
  }

  const defById = new Map<string, ItemDefinition>(snap.itemDefinitions.map((d) => [d.id, d]))

  const listeners = snap.users.map((u) => {
    const userId = u.userId
    const state =
      snap.userStates[userId] ??
      ({ userId, attributes: EMPTY_ATTRS, modifiers: [], flags: {} } satisfies UserGameState)
    const rawItems = snap.inventories[userId] ?? []
    const items: InventoryItem[] =
      rawItems.length > 0
        ? rawItems.map((item) => {
            const def = defById.get(item.definitionId)
            if (def?.sourcePlugin === "item-shops" && def.shortId === "mars-egg") {
              return { ...item, sellbackValue: marsEggSellbackValue(item, def) }
            }
            return item
          })
        : rawItems

    return {
      userId,
      username: u.username?.trim() || userId,
      state,
      inventory: { userId, items, maxSlots },
    }
  })

  return {
    session,
    listeners,
    itemDefinitions: snap.itemDefinitions,
  }
}

/** INIT payload aligned with `AuthService.login` → `initData` (subset used by web authMachine). */
export function buildInitPayload(snap: BridgeSnapshot, self: User) {
  const pluginConfigs = snap.pluginConfigs
  const users = snap.users.map((u) => ({
    ...u,
    status: u.status ?? ("participating" as const),
  }))
  const selfUser = {
    ...self,
    status: "participating" as const,
    isDeputyDj: self.isDeputyDj ?? false,
    isAdmin: self.isAdmin ?? true,
  }

  return {
    users,
    messages: snap.chat,
    meta: buildRoomMeta(snap),
    passwordRequired: false,
    playlist: [] as unknown[],
    queue: snap.queue,
    reactions: {
      message: {} as Record<string, unknown[]>,
      track: {} as Record<string, unknown[]>,
    },
    pluginConfigs,
    user: selfUser,
    accessToken: null as string | null,
    isNewUser: false,
    activeGameSession: snap.activeSession,
  }
}
