import type {
  ChatMessage,
  Emoji,
  PluginActionInitiator,
  Poll,
  PollCloseReason,
  ReactionSubject,
  User,
} from "@repo/types"
import {
  ITEM_SHOPS_PLUGIN_NAME,
  POLL_OPTION_LIMITS,
  isStorageContainerDefinition,
  resolveSlotPool,
  slotPoolFullMessage,
  type ArtifactContentInput,
  type InventoryItem,
  type ItemDefinition,
} from "@repo/types"
import {
  applyDepositMutations,
  applyWithdrawalDeliveries,
  authorizeArtifactRetrieve,
  computeFreeSlotsByPool,
  getChatSendDelayMs,
  planDeposit,
  planWithdrawal,
  readArtifactContents,
  STASH_NO_GRANT_MESSAGE,
  summarizeDeposit,
  summarizeWithdrawal,
  withdrawalPersistAction,
} from "@repo/game-logic"
import { BasePlugin } from "@repo/plugin-base"
import { SHOP_CATALOG, ITEM_CATALOG } from "@repo/plugin-item-shops"
import { cloneSampleQueueItem, getSampleQueueTemplates } from "./studioSampleQueue"
import { newId } from "./id"
import { STUDIO_PREVIEW_VIEW_AS_USER_KEY, STUDIO_SESSION_AFTER_RESET_KEY } from "./constants"
import { clearPersistedSnapshot, detachStudioPersistence } from "./studioPersistence"
import { getStudio } from "./studioEnvironment"
import { readShoppingInstance } from "./studioShoppingRead"
import { pruneUserModifiers } from "./userStateHelpers"

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
    initialValues: { coin: 25, score: 0 },
    maxInventorySlots: 12,
    maxCollectionSlots: 12,
    maxPlaybackSlots: 2,
    allowSelling: true,
    allowTrading: true,
  })
  for (const uid of room.users.keys()) {
    room.ensureParticipant(uid)
  }
}

export async function endStudioGameSession(): Promise<void> {
  const { itemShopsContext } = getStudio()
  const { studioCancelAllGiftsAndTrades } = await import("./studioGiftTrade")
  await studioCancelAllGiftsAndTrades()
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
  params?: Record<string, unknown>,
): Promise<{ success: boolean; message?: string }> {
  const { registry, room } = getStudio()
  const initiator: PluginActionInitiator = {
    userId,
    username: room.users.get(userId)?.username ?? userId,
  }
  return registry.executePluginAction(room.roomId, pluginName, action, initiator, params)
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
      message: slotPoolFullMessage(
        resolveSlotPool(room.getDefinition(defId)),
        "end the session or free a slot.",
      ),
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

  const now = Date.now()
  const rawState = room.getUserState(userId)
  const sendDelayMs = rawState
    ? getChatSendDelayMs(pruneUserModifiers(rawState, now).modifiers, now)
    : 0

  if (sendDelayMs > 0) {
    const createdAt = Date.now()
    const preview: ChatMessage = {
      content,
      timestamp: new Date(createdAt).toISOString(),
      user,
      expiresAt: createdAt + sendDelayMs,
      createdAt,
      contentSegments: [
        {
          text: content,
          effects: [{ type: "color", palette: "gray", token: "muted" }],
        },
      ],
    }
    room.appendChat(preview)
    await new Promise((resolve) => setTimeout(resolve, sendDelayMs))
  }

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

/** Immediate P2P transfer for Game Studio sandbox (gift accept / trade swap). */
export async function transferInventoryItem(
  fromUserId: string,
  toUserId: string,
  itemId: string,
  quantity = 1,
): Promise<boolean> {
  const { itemShopsContext } = getStudio()
  return itemShopsContext.inventory.transferItem(fromUserId, toUserId, itemId, quantity)
}

/**
 * Retrieve a stored artifact into the given user's inventory/coins.
 * Mirrors `retrieveStoredArtifact` via `applyWithdrawalDeliveries`.
 */
export async function retrieveArtifact(
  artifactId: string,
  password: string,
  retrievingUserId: string,
  contentIds?: string[],
  opts?: { useAccessGrant?: boolean },
): Promise<{ success: boolean; message: string }> {
  const { itemShopsContext, room } = getStudio()
  const username = room.users.get(retrievingUserId)?.username?.trim() || "Someone"
  const useGrant = opts?.useAccessGrant === true

  return itemShopsContext.artifacts.withArtifactLock(artifactId, async () => {
    const attempt = await authorizeArtifactRetrieve({
      artifacts: itemShopsContext.artifacts,
      artifactId,
      userId: retrievingUserId,
      password,
      useGrant,
    })

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
    if (attempt.status === "no_grant") {
      return { success: false, message: STASH_NO_GRANT_MESSAGE }
    }

    const art = attempt.artifact
    const contents = readArtifactContents(art)
    // An empty stash is retrieved to claim its container (ADR 0181).
    if (contentIds != null && contentIds.length === 0 && contents.length > 0) {
      return { success: false, message: "Select what to take." }
    }

    const inv = await itemShopsContext.inventory.getInventory(retrievingUserId)
    const definitionsById: Record<string, ItemDefinition | undefined> = {}
    for (const c of contents) {
      if (c.kind === "item") {
        definitionsById[c.itemDefinitionId] = room.getDefinition(c.itemDefinitionId) ?? undefined
      }
    }
    if (art.containerDefinitionId) {
      definitionsById[art.containerDefinitionId] =
        room.getDefinition(art.containerDefinitionId) ?? undefined
    }
    const freeSlotsByPool = computeFreeSlotsByPool(inv.items, inv, definitionsById)
    const plan = planWithdrawal({
      contents,
      selectedIds: contentIds,
      containerDefinitionId: art.containerDefinitionId,
      freeSlotsByPool,
      definitionsById,
    })
    if (plan.rejected.length > 0) {
      const first = plan.rejected.find((c) => c.kind === "item")
      return {
        success: false,
        message: slotPoolFullMessage(
          resolveSlotPool(first ? room.getDefinition(first.itemDefinitionId) : undefined),
          "make space and try again.",
        ),
      }
    }
    if (plan.deliveries.length === 0 && !plan.container) {
      if (!plan.containerBlocked) return { success: false, message: "Nothing to retrieve." }
      return {
        success: false,
        message: slotPoolFullMessage(
          resolveSlotPool(
            art.containerDefinitionId ? room.getDefinition(art.containerDefinitionId) : undefined,
          ),
          "make space and try again.",
        ),
      }
    }

    const delivered = await applyWithdrawalDeliveries({
      deliveries: plan.deliveries,
      container: plan.container,
      ports: {
        addCoins: (amount, reason) =>
          itemShopsContext.game.addScore(retrievingUserId, "coin", amount, reason, {
            intent: "exact",
          }),
        giveItem: (definitionId, quantity, metadata) =>
          itemShopsContext.inventory.giveItem(
            retrievingUserId,
            definitionId,
            quantity,
            metadata,
            "plugin",
          ),
        removeItem: (itemId, quantity) =>
          itemShopsContext.inventory.removeItem(retrievingUserId, itemId, quantity),
      },
    })
    if (!delivered.ok) {
      if (delivered.code === "invalid_coins") {
        return { success: false, message: "Invalid stored coins." }
      }
      if (delivered.code === "invalid_item") {
        return { success: false, message: "Invalid stored item." }
      }
      const failedDef =
        delivered.failedItem?.kind === "item"
          ? room.getDefinition(delivered.failedItem.itemDefinitionId)
          : plan.container
            ? room.getDefinition(plan.container.definitionId)
            : undefined
      return {
        success: false,
        message: slotPoolFullMessage(resolveSlotPool(failedDef), "make space and try again."),
      }
    }

    const persist = withdrawalPersistAction(plan, art.containerDefinitionId)
    if (persist.type === "remove") {
      await itemShopsContext.artifacts.remove(artifactId)
    } else {
      await itemShopsContext.artifacts.update(artifactId, { contents: persist.contents })
    }
    if (useGrant) {
      await itemShopsContext.artifacts.revokeAccessGrant(artifactId, retrievingUserId)
    }

    const containerDef = plan.container
      ? room.getDefinition(plan.container.definitionId)
      : art.containerDefinitionId
        ? room.getDefinition(art.containerDefinitionId)
        : null
    const summary = summarizeWithdrawal({
      username,
      deliveries: plan.deliveries,
      containerName: containerDef?.name ?? null,
      containerReturned: Boolean(plan.container),
    })
    await itemShopsContext.api.sendSystemMessage(room.roomId, summary.roomMessage)
    return { success: true, message: summary.privateMessage }
  })
}

/** Dev helper: grant pick access on a mock stash row (Game Studio only). */
export async function grantStashPickAccess(
  artifactId: string,
  userId: string,
  source = "lock-pick",
): Promise<{ success: boolean; message: string }> {
  const { itemShopsContext, room } = getStudio()
  const grant = await itemShopsContext.artifacts.grantAccess({
    artifactId,
    userId,
    source,
    roomId: room.roomId,
  })
  if (!grant) {
    return { success: false, message: "Could not grant access — stash missing?" }
  }
  return { success: true, message: "Pick access granted for ten minutes." }
}

/** Dev helper: backdate lastTouchedAt on a mock row (ADR 0182 pt 3). */
export function backdateStashLastTouched(
  artifactId: string,
  lastTouchedAt: number,
): { success: boolean; message: string } {
  const { itemShopsContext } = getStudio()
  const api = itemShopsContext.artifacts as import("./mockStudioArtifactsApi").MockStudioArtifactsApi
  if (typeof api.backdateLastTouchedAt !== "function") {
    return { success: false, message: "Backdate is only available in Game Studio." }
  }
  return api.backdateLastTouchedAt(artifactId, lastTouchedAt)
    ? { success: true, message: "lastTouchedAt backdated." }
    : { success: false, message: "Stash not found." }
}

/** Mirrors `depositStoredArtifact` via `applyDepositMutations`. */
export async function depositArtifact(
  artifactId: string,
  password: string,
  depositingUserId: string,
  opts?: {
    targetInventoryItemIds?: string[]
    coinAmount?: number
  },
): Promise<{ success: boolean; message: string }> {
  const { itemShopsContext, room } = getStudio()
  const username = room.users.get(depositingUserId)?.username?.trim() || "Someone"

  return itemShopsContext.artifacts.withArtifactLock(artifactId, async () => {
    const attempt = await itemShopsContext.artifacts.attemptRetrieve(artifactId, password)
    if (attempt.status === "not_found") {
      await itemShopsContext.api.sendSystemMessage(
        room.roomId,
        `${username} tried to add to storage that is no longer here.`,
      )
      return { success: false, message: "That stored item no longer exists." }
    }
    if (attempt.status === "wrong_password") {
      await itemShopsContext.api.sendSystemMessage(
        room.roomId,
        `${username} failed to add to a stash (wrong password).`,
      )
      return { success: false, message: "Wrong password." }
    }

    const art = attempt.artifact
    const contents = readArtifactContents(art)
    const inv = await itemShopsContext.inventory.getInventory(depositingUserId)
    const incoming: ArtifactContentInput[] = []
    const stacks: InventoryItem[] = []
    const targetIds = opts?.targetInventoryItemIds ?? []

    for (const itemId of targetIds) {
      const stack = inv.items.find((i: InventoryItem) => i.itemId === itemId)
      if (!stack) return { success: false, message: "That item is not in your inventory." }
      const def = room.getDefinition(stack.definitionId)
      if (isStorageContainerDefinition(def)) {
        return { success: false, message: "You can't store that item." }
      }
      stacks.push(stack)
      incoming.push({
        kind: "item",
        itemDefinitionId: stack.definitionId,
        itemName: def?.name ?? stack.definitionId,
        itemQuantity: stack.quantity,
        ...(stack.metadata != null ? { metadata: stack.metadata } : {}),
      })
    }

    const coinAmount =
      typeof opts?.coinAmount === "number" && Number.isFinite(opts.coinAmount)
        ? Math.floor(opts.coinAmount)
        : 0
    if (coinAmount > 0) {
      const state = await itemShopsContext.game.getUserState(depositingUserId)
      const current = state?.attributes?.coin ?? 0
      if (current < coinAmount) return { success: false, message: "You don't have enough coins." }
      incoming.push({ kind: "coin", coinValue: coinAmount })
    }

    if (incoming.length === 0) {
      return { success: false, message: "Nothing to add." }
    }

    let capacity = Math.max(contents.length, 1)
    if (art.containerDefinitionId) {
      const containerDef = room.getDefinition(art.containerDefinitionId)
      if (typeof containerDef?.storageCapacity === "number" && containerDef.storageCapacity > 0) {
        capacity = containerDef.storageCapacity
      }
    }
    const plan = planDeposit({ contents, capacity, incoming })
    if (plan.rejected.length > 0) {
      return { success: false, message: "That stash is full." }
    }

    const mutated = await applyDepositMutations({
      stacks,
      coinAmount,
      nextContents: plan.nextContents,
      ports: {
        removeItem: (itemId, quantity) =>
          itemShopsContext.inventory.removeItem(depositingUserId, itemId, quantity),
        giveItem: (definitionId, quantity, metadata) =>
          itemShopsContext.inventory.giveItem(
            depositingUserId,
            definitionId,
            quantity,
            metadata,
            "plugin",
          ),
        debitCoins: (amount) =>
          itemShopsContext.game.addScore(
            depositingUserId,
            "coin",
            -amount,
            "stored-artifact:deposit",
            { intent: "exact" },
          ),
        creditCoins: (amount) =>
          itemShopsContext.game.addScore(
            depositingUserId,
            "coin",
            amount,
            "stored-artifact:deposit-refund",
            { intent: "exact" },
          ),
        updateArtifact: (nextContents) =>
          itemShopsContext.artifacts.update(artifactId, { contents: nextContents }),
      },
    })
    if (!mutated.ok) {
      return { success: false, message: mutated.message }
    }

    const containerDef = art.containerDefinitionId
      ? room.getDefinition(art.containerDefinitionId)
      : null
    const summary = summarizeDeposit({
      username,
      incoming,
      containerName: containerDef?.name ?? null,
    })
    await itemShopsContext.api.sendSystemMessage(room.roomId, summary.roomMessage)
    return { success: true, message: summary.privateMessage }
  })
}

/** `storingItemId` for artifacts injected via Game Studio drawer (not from Van Cubby / Merch Cash Box use). */
const STUDIO_MANUAL_STORING_ITEM_ID = "studio-manual"

/** Seed global stored artifacts with coins (Listening Room “Storage” tab / bridge preview). */
export async function storeSandboxArtifactCoin(
  storedByUserId: string,
  coinValue: number,
  password: string,
): Promise<{ success: boolean; message?: string }> {
  const { room, itemShopsContext } = getStudio()
  const pw = password.trim()
  if (!pw) return { success: false, message: "Enter a password." }
  if (!room.users.has(storedByUserId))
    return { success: false, message: "Pick a user in the room." }
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
  if (!room.users.has(storedByUserId))
    return { success: false, message: "Pick a user in the room." }

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

const STUDIO_POLL_ADMIN_ID = "studio-admin"

/** Clears when the active poll is closed or replaced (ADR 0189 studio parity). */
let studioPollAutoCloseTimer: ReturnType<typeof setTimeout> | null = null

function clearStudioPollAutoClose(): void {
  if (studioPollAutoCloseTimer != null) {
    clearTimeout(studioPollAutoCloseTimer)
    studioPollAutoCloseTimer = null
  }
}

function scheduleStudioPollAutoClose(poll: Poll): void {
  clearStudioPollAutoClose()
  if (poll.closesAt == null) return
  const pollId = poll.id
  const delay = Math.max(1, poll.closesAt - Date.now())
  studioPollAutoCloseTimer = setTimeout(() => {
    studioPollAutoCloseTimer = null
    const { room } = getStudio()
    if (room.activePoll?.id !== pollId || room.activePoll.status !== "open") return
    closeStudioPoll({ reason: "expired" })
  }, delay)
}

export type CreateStudioPollInput = {
  question: string
  options: { label: string }[]
  hideRunningTotal?: boolean
  durationMs?: number
}

export function createStudioPoll({
  question,
  options,
  hideRunningTotal = false,
  durationMs,
}: CreateStudioPollInput): { ok: true; poll: Poll } | { ok: false; message: string } {
  const { room } = getStudio()
  const trimmedQuestion = question.trim()

  if (!trimmedQuestion) {
    return { ok: false, message: "Enter a poll question." }
  }
  if (trimmedQuestion.length > 280) {
    return { ok: false, message: "Question must be 280 characters or fewer." }
  }

  const labels = options.map((o) => o.label.trim()).filter(Boolean)
  if (labels.length < POLL_OPTION_LIMITS.min) {
    return {
      ok: false,
      message: `A poll needs at least ${POLL_OPTION_LIMITS.min} options.`,
    }
  }
  if (labels.some((l) => l.length > 120)) {
    return { ok: false, message: "Each option must be 120 characters or fewer." }
  }
  if (room.activePoll?.status === "open") {
    return {
      ok: false,
      message: "Another poll is already active. Close it before publishing a new one.",
    }
  }

  const now = Date.now()
  let closesAt: number | null = null
  if (durationMs != null) {
    if (!Number.isFinite(durationMs) || durationMs < 5_000) {
      return { ok: false, message: "Poll duration must be at least 5 seconds." }
    }
    if (durationMs > 24 * 60 * 60_000) {
      return { ok: false, message: "Poll duration must be at most 24 hours." }
    }
    closesAt = now + durationMs
  }

  const poll: Poll = {
    id: newId(),
    roomId: room.roomId,
    question: trimmedQuestion,
    options: labels.map((label) => ({ id: newId(), label })),
    status: "open",
    settings: { hideRunningTotal },
    createdAt: now,
    createdBy: STUDIO_POLL_ADMIN_ID,
    publishedAt: now,
    closedAt: null,
    closesAt,
  }

  room.setActivePoll(poll)
  scheduleStudioPollAutoClose(poll)
  room.logEvent("POLL_PUBLISHED", { roomId: room.roomId, poll })
  return { ok: true, poll }
}

export function closeStudioPoll(opts?: {
  reason?: PollCloseReason
}): { ok: true; pollId: string } | { ok: false; message: string } {
  clearStudioPollAutoClose()
  const { room } = getStudio()
  const entry = room.closePoll()
  if (!entry) {
    return { ok: false, message: "No open poll to close." }
  }

  room.logEvent("POLL_CLOSED", {
    roomId: room.roomId,
    poll: entry.poll,
    results: entry.results,
    reason: opts?.reason ?? "manual",
  })
  return { ok: true, pollId: entry.poll.id }
}

export function deleteStudioPoll(pollId: string): { ok: true } | { ok: false; message: string } {
  const { room } = getStudio()
  if (!pollId.trim()) {
    return { ok: false, message: "Poll id is required." }
  }

  const wasActive = room.activePoll?.id === pollId
  const removed = room.deletePoll(pollId)
  if (!removed) {
    return { ok: false, message: "Poll not found." }
  }
  if (wasActive) clearStudioPollAutoClose()

  room.logEvent("POLL_DELETED", { roomId: room.roomId, pollId })
  return { ok: true }
}

export type CastStudioPollVoteResult =
  | { ok: true; isFirstVote: boolean; totalVotes: number | null }
  | { ok: false; reason: "POLL_CLOSED" | "POLL_NOT_FOUND" | "INVALID_OPTION" }

export function castStudioPollVote(userId: string, optionId: string): CastStudioPollVoteResult {
  const { room } = getStudio()
  const poll = room.activePoll

  if (!poll || poll.status !== "open") {
    return { ok: false, reason: poll ? "POLL_CLOSED" : "POLL_NOT_FOUND" }
  }

  // Cover the gap between closesAt and the auto-close timer (ADR 0189).
  if (poll.closesAt != null && Date.now() >= poll.closesAt) {
    return { ok: false, reason: "POLL_CLOSED" }
  }

  if (!poll.options.some((o) => o.id === optionId)) {
    return { ok: false, reason: "INVALID_OPTION" }
  }

  const isFirstVote = !room.pollVotes.has(userId)
  room.addPollVote(userId, optionId)

  const totalVotes = poll.settings.hideRunningTotal ? null : room.pollVotes.size

  if (isFirstVote) {
    room.logEvent("POLL_VOTE_CAST", {
      roomId: room.roomId,
      pollId: poll.id,
      totalVotes,
    })
  }

  return { ok: true, isFirstVote, totalVotes }
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
