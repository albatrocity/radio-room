import type { ChatMessage, Emoji, PluginActionInitiator, ReactionSubject, User } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { BasePlugin } from "@repo/plugin-base"
import { SHOP_CATALOG, ITEM_CATALOG } from "@repo/plugin-item-shops"
import { cloneSampleQueueItem, getSampleQueueTemplates } from "./studioSampleQueue"
import { newId } from "./id"
import { STUDIO_PREVIEW_VIEW_AS_USER_KEY, STUDIO_SESSION_AFTER_RESET_KEY } from "./constants"
import { clearPersistedSnapshot, detachStudioPersistence } from "./studioPersistence"
import { getStudio } from "./studioEnvironment"
import { readShoppingInstance } from "./studioShoppingRead"

/** Lets studio-bridge notify Listening Room tabs after sandbox queue mutation (fire-and-forget). */
async function notifyBridgeQueueRemoveResult(
  roomId: string,
  trackId: string,
  result: { success: boolean; message?: string; trackTitle?: string },
): Promise<void> {
  const env =
    typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_STUDIO_BRIDGE_URL
  const root = String(env ?? "http://127.0.0.1:3099").replace(/\/$/, "")
  try {
    await fetch(`${root}/preview/queue-remove-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        trackId,
        success: result.success,
        message: result.message,
        trackTitle: result.trackTitle,
      }),
    })
  } catch {
    /* preview-only */
  }
}

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
  const user: User = {
    userId,
    username: username.trim() || userId,
    status: "listening",
    /** Sandbox preview: treat studio users as room admins for queue/auth parity with studio-bridge. */
    isAdmin: true,
  }
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

/** Assign shops to users who joined before the shopping round (Game Studio drawer — uses plugin action, not lifecycle replay). */
export async function replayUserJoinedForAllUsers(): Promise<{
  success: boolean
  message?: string
}> {
  const { registry, room } = getStudio()
  const initiator: PluginActionInitiator = { userId: "studio-admin", username: "Studio" }
  return registry.executePluginAction(
    room.roomId,
    ITEM_SHOPS_PLUGIN_NAME,
    "replayShopAssignmentsForExistingUsers",
    initiator,
  )
}

export async function startStudioGameSession(): Promise<void> {
  const { room, itemShopsContext } = getStudio()
  await itemShopsContext.game.startSession({
    name: "Sandbox session",
    initialValues: { coin: 500, score: 0 },
    maxInventorySlots: 3,
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
  return registry.executePluginAction(
    room.roomId,
    ITEM_SHOPS_PLUGIN_NAME,
    "endShoppingSessions",
    initiator,
  )
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
  return registry.executePluginAction(
    room.roomId,
    ITEM_SHOPS_PLUGIN_NAME,
    `buy:${offerId}`,
    initiator,
  )
}

/** Plugin actions from Listening Room preview (buy, admin buttons, etc.). */
export async function executeBridgePluginAction(
  userId: string,
  pluginName: string,
  action: string,
): Promise<{ success: boolean; message?: string }> {
  const { registry, room } = getStudio()
  const initiator: PluginActionInitiator = {
    userId,
    username: room.users.get(userId)?.username ?? userId,
  }
  return registry.executePluginAction(room.roomId, pluginName, action, initiator)
}

export async function giveItemDirect(
  userId: string,
  shortId: string,
): Promise<{ success: boolean; message?: string }> {
  const { itemShopsContext, room } = getStudio()
  const defId = `${ITEM_SHOPS_PLUGIN_NAME}:${shortId}`

  if (!room.activeSession) {
    return {
      success: false,
      message: "Start a game session first (toolbar → Start game).",
    }
  }
  if (!room.getDefinition(defId)) {
    return {
      success: false,
      message: `Unknown item "${shortId}". Item definitions may be missing — reload the page or use Reset if this persists.`,
    }
  }

  const row = await itemShopsContext.inventory.giveItem(userId, defId, 1, undefined, "plugin")
  if (!row) {
    return {
      success: false,
      message: "Could not grant item (inventory may be full — end session or free a slot).",
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

/**
 * App-controlled queue removal from Listening Room preview (studio-bridge → Game Studio).
 * Matches production authorization: track owner or room admin (sandbox users carry `isAdmin` from studio-bridge).
 */
export async function removeQueueTrackForBridge(
  userId: string,
  trackId: string,
  opts: { isAdmin: boolean },
): Promise<{ success: boolean; message?: string; trackTitle?: string }> {
  const { room, lifecycle } = getStudio()
  const roomId = room.roomId
  const idx = room.queue.findIndex((q) => q.track.id === trackId)
  if (idx === -1) {
    const r = { success: false as const, message: "Track not found in queue" }
    await notifyBridgeQueueRemoveResult(roomId, trackId, r)
    return r
  }
  const item = room.queue[idx]!
  const isOwner = item.addedBy?.userId === userId
  if (!opts.isAdmin && !isOwner) {
    const r = { success: false as const, message: "Not authorized to remove this track" }
    await notifyBridgeQueueRemoveResult(roomId, trackId, r)
    return r
  }
  const title = item.track.title || item.title || "Track"
  room.queue.splice(idx, 1)
  room.logEvent("QUEUE_REMOVE_BRIDGE", { trackId })
  await lifecycle.emit("QUEUE_CHANGED", { roomId, queue: [...room.queue] })
  room.notify()
  const ok = { success: true as const, trackTitle: title }
  await notifyBridgeQueueRemoveResult(roomId, trackId, ok)
  return ok
}

export async function addFakeTrackToQueue(userId: string): Promise<void> {
  const { room, lifecycle } = getStudio()
  const templates = getSampleQueueTemplates()
  const u = room.users.get(userId)
  const idx = room.queue.length % templates.length
  const item = cloneSampleQueueItem(templates[idx]!, {
    addedBy: u ? { userId: u.userId, username: u.username ?? u.userId } : undefined,
  })
  room.queue.push(item)
  await lifecycle.emit("PLAYLIST_TRACK_ADDED", { roomId: room.roomId, track: item })
  room.logEvent("QUEUE_ADD", { metadataTrackId: item.track.id })
  room.notify()
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

/**
 * Retrieve a stored artifact into the given user's inventory/coins (sandbox mirror of production socket flow).
 */
export async function retrieveArtifact(
  artifactId: string,
  password: string,
  retrievingUserId: string,
): Promise<{ success: boolean; message: string }> {
  const { itemShopsContext, room } = getStudio()
  const username = room.users.get(retrievingUserId)?.username?.trim() || "Someone"

  const attempt = await itemShopsContext.artifacts.attemptRetrieve(artifactId, password)

  if (attempt.status === "not_found") {
    await itemShopsContext.api.sendSystemMessage(
      room.roomId,
      `${username} tried to retrieve storage that is no longer here.`,
    )
    return { success: false, message: "That stored item no longer exists." }
  }

  if (attempt.status === "wrong_password") {
    await itemShopsContext.api.sendSystemMessage(
      room.roomId,
      `${username} failed to retrieve an artifact from storage (wrong password).`,
    )
    return { success: false, message: "Wrong password." }
  }

  const art = attempt.artifact

  if (art.artifactType === "coin") {
    const amt = art.coinValue ?? 0
    if (amt < 1) {
      return { success: false, message: "Invalid stored coins." }
    }
    await itemShopsContext.game.addScore(retrievingUserId, "coin", amt, "stored-artifact:retrieve")
    await itemShopsContext.artifacts.remove(artifactId)
    await itemShopsContext.api.sendSystemMessage(
      room.roomId,
      `${username} retrieved ${amt.toLocaleString()} coins from storage.`,
    )
    return { success: true, message: `Added ${amt.toLocaleString()} coins.` }
  }

  const defId = art.itemDefinitionId
  const qty = art.itemQuantity ?? 1
  if (!defId || qty < 1) {
    return { success: false, message: "Invalid stored item." }
  }

  const given = await itemShopsContext.inventory.giveItem(
    retrievingUserId,
    defId,
    qty,
    undefined,
    "plugin",
  )
  if (!given) {
    return { success: false, message: "Inventory full — make space and try again." }
  }

  await itemShopsContext.artifacts.remove(artifactId)
  const label = art.itemName ?? "an item"
  await itemShopsContext.api.sendSystemMessage(
    room.roomId,
    `${username} retrieved ${label} from storage.`,
  )
  return { success: true, message: `Received ${label}.` }
}

/** `storingItemId` for artifacts injected via Game Studio drawer (not from Van Cubby / Merch Cash Box use). */
const STUDIO_MANUAL_STORING_ITEM_ID = "studio-manual"

/** Seed global stored artifacts with coins (Listening Room “Stored Items” / bridge preview). */
export async function storeSandboxArtifactCoin(
  storedByUserId: string,
  coinValue: number,
  password: string,
): Promise<{ success: boolean; message?: string }> {
  const { room, itemShopsContext } = getStudio()
  const pw = password.trim()
  if (!pw) return { success: false, message: "Enter a password." }
  if (!room.users.has(storedByUserId)) return { success: false, message: "Pick a user in the room." }
  const amount = Math.floor(Number(coinValue))
  if (!Number.isFinite(amount) || amount < 1) {
    return { success: false, message: "Enter a positive coin amount." }
  }

  const username = room.users.get(storedByUserId)?.username?.trim() || storedByUserId
  await itemShopsContext.artifacts.store({
    storingPlugin: ITEM_SHOPS_PLUGIN_NAME,
    storingItemId: STUDIO_MANUAL_STORING_ITEM_ID,
    artifactType: "coin",
    coinValue: amount,
    storedAt: Date.now(),
    storedByUserId,
    storedByUsername: username,
    password: pw,
  })
  return { success: true, message: `Stored ${amount.toLocaleString()} coins (password set).` }
}

/** Seed global stored artifacts with an item stack (matches Van Cubby-shaped payloads). */
export async function storeSandboxArtifactItem(
  storedByUserId: string,
  shortId: string,
  quantity: number,
  password: string,
): Promise<{ success: boolean; message?: string }> {
  const { room, itemShopsContext } = getStudio()
  const pw = password.trim()
  if (!pw) return { success: false, message: "Enter a password." }
  if (!room.users.has(storedByUserId)) return { success: false, message: "Pick a user in the room." }

  const defId = `${ITEM_SHOPS_PLUGIN_NAME}:${shortId}`
  if (!room.getDefinition(defId)) {
    return {
      success: false,
      message: `Unknown item "${shortId}". Start a game session so definitions load, or reload.`,
    }
  }

  const entry = ITEM_CATALOG.find((e) => e.definition.shortId === shortId)
  const itemName = entry?.definition.name ?? shortId
  const qty = Math.floor(Number(quantity))
  if (!Number.isFinite(qty) || qty < 1) {
    return { success: false, message: "Enter a positive quantity." }
  }

  const username = room.users.get(storedByUserId)?.username?.trim() || storedByUserId
  await itemShopsContext.artifacts.store({
    storingPlugin: ITEM_SHOPS_PLUGIN_NAME,
    storingItemId: STUDIO_MANUAL_STORING_ITEM_ID,
    artifactType: "item",
    itemDefinitionId: defId,
    itemName,
    itemQuantity: qty,
    storedAt: Date.now(),
    storedByUserId,
    storedByUsername: username,
    password: pw,
  })
  return { success: true, message: `Stored ${qty}× ${itemName} (password set).` }
}

export async function removeSandboxStoredArtifact(
  artifactId: string,
): Promise<{ success: boolean; message?: string }> {
  const { itemShopsContext } = getStudio()
  const ok = await itemShopsContext.artifacts.remove(artifactId)
  return ok
    ? { success: true, message: "Removed from sandbox storage." }
    : { success: false, message: "Artifact not found." }
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
  /** Next bootstrap pass clears the queue after reload (see `STUDIO_SESSION_AFTER_RESET_KEY`). */
  sessionStorage.setItem(STUDIO_SESSION_AFTER_RESET_KEY, "1")
  sessionStorage.removeItem(STUDIO_PREVIEW_VIEW_AS_USER_KEY)
  window.location.reload()
}

/** Immediately run pending plugin timer callbacks (sandbox dev aid — e.g. Sweetwater follow-ups). */
export function fireAllPluginTimers(): { fired: number } {
  const { room, registry } = getStudio()
  let fired = 0
  for (const plugin of registry.list(room.roomId)) {
    if (plugin instanceof BasePlugin) {
      fired += plugin.fireAllTimers()
    }
  }
  return { fired }
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
