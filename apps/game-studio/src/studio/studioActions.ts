import type {
  ChatMessage,
  Emoji,
  PluginActionInitiator,
  ReactionSubject,
  User,
} from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { SHOP_CATALOG, ITEM_CATALOG } from "@repo/plugin-item-shops"
import { newId } from "./id"
import { enforceStudioItemShopsPluginDefaults, resetStudioRoomToInitialSandbox } from "./studioBootstrap"
import {
  attachStudioPersistence,
  clearPersistedSnapshot,
  detachStudioPersistence,
  persistStudioRoom,
} from "./studioPersistence"
import { getStudio } from "./studioEnvironment"
import { readShoppingInstance } from "./studioShoppingRead"

function stubEmoji(native: string): Emoji {
  return {
    id: native,
    name: native,
    keywords: [],
    shortcodes: native,
    native,
  }
}

export function addStudioUser(username: string): void {
  const { room, lifecycle } = getStudio()
  const userId = `user-${newId().slice(0, 10)}`
  const user: User = { userId, username: username.trim() || userId, status: "listening" }
  room.addUser(user)
  if (room.activeSession) {
    room.ensureParticipant(userId)
  }
  void lifecycle.emit("USER_JOINED", {
    roomId: room.roomId,
    user,
    users: [...room.users.values()],
  })
}

/** Replay assign-shop hooks when shopping starts before users join (sandbox UX). */
export async function replayUserJoinedForAllUsers(): Promise<void> {
  const { room, lifecycle } = getStudio()
  const users = [...room.users.values()]
  for (const user of users) {
    await lifecycle.emit("USER_JOINED", {
      roomId: room.roomId,
      user,
      users,
    })
  }
}

export async function startStudioGameSession(): Promise<void> {
  const { room, itemShopsContext } = getStudio()
  await itemShopsContext.game.startSession({
    name: "Sandbox session",
    initialValues: { coin: 500, score: 0 },
    maxInventorySlots: 12,
    allowSelling: true,
  })
  for (const uid of room.users.keys()) {
    room.ensureParticipant(uid)
  }
}

export async function endStudioGameSession(): Promise<void> {
  const { itemShopsContext } = getStudio()
  await itemShopsContext.game.endSession()
}

export async function startShoppingSession(): Promise<{ success: boolean; message?: string }> {
  const { registry, room, lifecycle } = getStudio()
  const initiator: PluginActionInitiator = { userId: "studio-admin", username: "Studio" }
  const res = await registry.executePluginAction(
    room.roomId,
    ITEM_SHOPS_PLUGIN_NAME,
    "startShoppingSession",
    initiator,
  )
  if (!res.success) return res

  const users = [...room.users.values()]
  for (const user of users) {
    if (readShoppingInstance(room, user.userId)) continue
    await lifecycle.emit("USER_JOINED", {
      roomId: room.roomId,
      user,
      users,
    })
  }
  return res
}

export async function endShoppingSession(): Promise<{ success: boolean; message?: string }> {
  const { registry, room } = getStudio()
  const initiator: PluginActionInitiator = { userId: "studio-admin", username: "Studio" }
  return registry.executePluginAction(room.roomId, ITEM_SHOPS_PLUGIN_NAME, "endShoppingSessions", initiator)
}

export async function purchaseOffer(
  userId: string,
  offerId: number,
): Promise<{ success: boolean; message?: string }> {
  const { registry, room } = getStudio()
  const initiator: PluginActionInitiator = {
    userId,
    username: room.users.get(userId)?.username ?? userId,
  }
  return registry.executePluginAction(room.roomId, ITEM_SHOPS_PLUGIN_NAME, `buy:${offerId}`, initiator)
}

export async function giveItemDirect(
  userId: string,
  shortId: string,
): Promise<{ success: boolean; message?: string }> {
  const { itemShopsContext } = getStudio()
  const defId = `${ITEM_SHOPS_PLUGIN_NAME}:${shortId}`
  const row = await itemShopsContext.inventory.giveItem(userId, defId, 1, undefined, "plugin")
  if (!row) {
    return {
      success: false,
      message: "Could not grant item (needs active session / inventory space / unknown definition).",
    }
  }
  return { success: true }
}

export function catalogExports() {
  return { SHOP_CATALOG, ITEM_CATALOG }
}

export async function applyGainCoin(userId: string, n: number): Promise<void> {
  const { itemShopsContext } = getStudio()
  await itemShopsContext.game.addScore(userId, "coin", n, "studio")
}

export async function applyGainScore(userId: string, n: number): Promise<void> {
  const { itemShopsContext } = getStudio()
  await itemShopsContext.game.addScore(userId, "score", n, "studio")
}

export async function addFakeTrackToQueue(userId: string): Promise<void> {
  const { itemShopsContext, room } = getStudio()
  const trackId = `fake-${newId().slice(0, 8)}`
  const u = room.users.get(userId)
  await itemShopsContext.api.addToTrackQueue(room.roomId, trackId, {
    addedBy: u
      ? { type: "user", userId: u.userId, username: u.username ?? u.userId }
      : undefined,
  })
}

export async function advanceNowPlaying(): Promise<void> {
  const { itemShopsContext, room } = getStudio()
  const np = await itemShopsContext.api.getNowPlaying(room.roomId)
  if (np?.mediaSource.trackId) {
    await itemShopsContext.api.skipTrack(room.roomId, np.mediaSource.trackId)
  }
}

export async function sendChatAsUser(userId: string, content: string): Promise<void> {
  const { room, itemShopsPlugin } = getStudio()
  const user = room.users.get(userId)
  if (!user) return
  let message: ChatMessage = {
    content,
    timestamp: new Date().toISOString(),
    user,
  }
  const pluginTransformed = await itemShopsPlugin.transformChatMessage?.(room.roomId, message)
  if (pluginTransformed) {
    message = pluginTransformed
  }
  room.appendChat(message)
}

export async function useInventoryItem(
  userId: string,
  itemId: string,
  callContext?: unknown,
): Promise<string> {
  const { itemShopsContext } = getStudio()
  const res = await itemShopsContext.inventory.useItem(userId, itemId, callContext)
  return res.message ?? (res.success ? "OK" : "Failed")
}

export async function sellInventoryItem(userId: string, itemId: string): Promise<string> {
  const { registry, room } = getStudio()
  const inv = room.getInventory(userId)
  const row = inv.find((i) => i.itemId === itemId)
  if (!row) return "Item not found"
  const def = room.getDefinition(row.definitionId)
  if (!def) return "Unknown definition"
  const res = await registry.invokeOnItemSold(room, def.sourcePlugin, userId, row, def, undefined)
  return res?.message ?? (res?.success ? "Sold" : "Failed")
}

/** Drop persisted snapshot and reload (plugins re-register). Fixes unload repersist race. */
export function resetStudioSandbox(): void {
  const { room } = getStudio()
  detachStudioPersistence(room)
  clearPersistedSnapshot()
  window.location.reload()
}

/** Wipe all sandbox state in this tab without reloading. */
export function clearStudioSandbox(): void {
  const { room } = getStudio()
  detachStudioPersistence(room)
  clearPersistedSnapshot()
  resetStudioRoomToInitialSandbox(room)
  enforceStudioItemShopsPluginDefaults(room)
  persistStudioRoom(room)
  attachStudioPersistence(room)
}

export async function reactToNowPlaying(userId: string, emoji: string): Promise<void> {
  const { room, itemShopsContext, lifecycle } = getStudio()
  const np = await itemShopsContext.api.getNowPlaying(room.roomId)
  if (!np) return
  const user = room.users.get(userId)
  if (!user) return
  const reactTo: ReactionSubject = { type: "track", id: np.track.id }
  room.addReaction(room.roomId, reactTo, { emoji, user: userId })
  await lifecycle.emit("REACTION_ADDED", {
    roomId: room.roomId,
    reaction: {
      emoji: stubEmoji(emoji),
      reactTo,
      user,
    },
  })
}

