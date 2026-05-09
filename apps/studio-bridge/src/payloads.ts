import type { GameStateModifier } from "@repo/types/GameSession"
import type { User } from "@repo/types/User"
import type { BridgeSnapshot } from "./types.js"

/** Mirrors `packages/server/lib/getRoomPath`. */
export function roomSocketPath(roomId: string): string {
  return `/rooms/${roomId}`
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

export function buildUserGameStatePayload(snap: BridgeSnapshot, userId: string) {
  const maxSlots = snap.activeSession?.config.maxInventorySlots ?? 12
  const session = snap.activeSession
  const state = snap.userStates[userId] ?? null
  const items = snap.inventories[userId] ?? []
  const currentShopInstance = snap.shoppingByUser[userId] ?? null

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
    meta: {
      stationMeta: {},
    },
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
