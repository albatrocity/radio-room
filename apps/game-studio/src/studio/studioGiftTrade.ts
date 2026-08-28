import type {
  GiftActionResult,
  GiftOffer,
  InventoryItem,
  ItemDefinition,
  TradeActionResult,
  TradeDraftItem,
  TradeInvite,
  TradeOfferItem,
  TradeParticipantState,
  TradeSession,
} from "@repo/types"
import { PLAYER_TRANSFER_TTL_MS } from "@repo/types/PlayerTransfer"
import { TRADE_MESSAGE_MAX_LENGTH, draftFromEscrowedOffer } from "@repo/types"
import type { StudioRoom } from "./studioRoom"
import { getStudio } from "./studioEnvironment"

function newId(): string {
  return crypto.randomUUID()
}

function slotPoolOf(def: ItemDefinition | null | undefined): "inventory" | "collection" {
  return def?.slotPool === "collection" ? "collection" : "inventory"
}

function emptyParticipant(userId: string): TradeParticipantState {
  return { userId, draft: [], offer: [], locked: false, confirmed: false }
}

function tradingAllowed(room: StudioRoom): boolean {
  return room.activeSession?.config.allowTrading === true
}

function findTradeForUser(room: StudioRoom, userId: string): TradeSession | null {
  for (const trade of room.trades.values()) {
    if (trade.status === "completed" || trade.status === "cancelled") continue
    if (trade.participants[userId]) return trade
  }
  return null
}

const inviteExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>()

function expireStaleInvites(room: StudioRoom): void {
  const now = Date.now()
  room.pendingTradeInvites = room.pendingTradeInvites.filter(
    (invite) => now - invite.createdAt < PLAYER_TRANSFER_TTL_MS,
  )
}

function removeInvite(room: StudioRoom, inviteId: string): TradeInvite | null {
  const idx = room.pendingTradeInvites.findIndex((i) => i.inviteId === inviteId)
  if (idx < 0) return null
  const [invite] = room.pendingTradeInvites.splice(idx, 1)
  const timer = inviteExpiryTimers.get(inviteId)
  if (timer) {
    clearTimeout(timer)
    inviteExpiryTimers.delete(inviteId)
  }
  return invite ?? null
}

function scheduleInviteExpiry(room: StudioRoom, invite: TradeInvite): void {
  const remaining = invite.createdAt + PLAYER_TRANSFER_TTL_MS - Date.now()
  const delay = Math.max(0, remaining)
  const timer = setTimeout(() => {
    inviteExpiryTimers.delete(invite.inviteId)
    if (room.pendingTradeInvites.some((i) => i.inviteId === invite.inviteId)) {
      removeInvite(room, invite.inviteId)
      room.notify()
    }
  }, delay)
  inviteExpiryTimers.set(invite.inviteId, timer)
}

async function giveEscrowed(
  toUserId: string,
  row: {
    definitionId: string
    quantity: number
    metadata?: Record<string, unknown>
  },
  source: "gift" | "trade" = "gift",
): Promise<InventoryItem | null> {
  const { itemShopsContext } = getStudio()
  return itemShopsContext.inventory.giveItem(
    toUserId,
    row.definitionId,
    row.quantity,
    row.metadata,
    source,
  )
}

export function pendingGiftsForUser(
  room: StudioRoom,
  userId: string,
): { incoming: GiftOffer[]; outgoing: GiftOffer[] } {
  const incoming: GiftOffer[] = []
  const outgoing: GiftOffer[] = []
  for (const offer of room.pendingGifts) {
    if (offer.toUserId === userId) incoming.push(offer)
    if (offer.fromUserId === userId) outgoing.push(offer)
  }
  return { incoming, outgoing }
}

export function activeTradeForUser(room: StudioRoom, userId: string): TradeSession | null {
  return findTradeForUser(room, userId)
}

export function pendingTradeInvitesForUser(
  room: StudioRoom,
  userId: string,
): { incoming: TradeInvite[]; outgoing: TradeInvite[] } {
  expireStaleInvites(room)
  const incoming: TradeInvite[] = []
  const outgoing: TradeInvite[] = []
  for (const invite of room.pendingTradeInvites) {
    if (invite.toUserId === userId) incoming.push(invite)
    if (invite.fromUserId === userId) outgoing.push(invite)
  }
  return { incoming, outgoing }
}

export async function studioOfferGift(params: {
  fromUserId: string
  toUserId: string
  itemId: string
  quantity?: number
}): Promise<GiftActionResult> {
  const { room, itemShopsContext } = getStudio()
  const { fromUserId, toUserId, itemId } = params
  const quantity = Math.max(1, Math.floor(params.quantity ?? 1))

  if (fromUserId === toUserId) {
    return { success: false, message: "You can't gift an item to yourself" }
  }
  if (!tradingAllowed(room)) {
    return { success: false, message: "Trading is not enabled for this session" }
  }
  if (room.pendingGifts.some((o) => o.fromUserId === fromUserId)) {
    return { success: false, message: "You already have a pending gift offer" }
  }
  if (room.pendingGifts.some((o) => o.fromUserId === fromUserId && o.toUserId === toUserId)) {
    return { success: false, message: "You already have a pending gift to that listener" }
  }

  const inv = [...room.getInventory(fromUserId)]
  const idx = inv.findIndex((i) => i.itemId === itemId)
  if (idx < 0) return { success: false, message: "Item not found in your inventory" }
  const row = inv[idx]!
  const def = room.getDefinition(row.definitionId)
  if (!def?.tradeable) return { success: false, message: "That item can't be gifted" }

  const qty = Math.min(quantity, row.quantity)
  const removed = await itemShopsContext.inventory.removeItem(fromUserId, itemId, qty)
  if (!removed) return { success: false, message: "Could not escrow gift" }

  const offer: GiftOffer = {
    offerId: newId(),
    roomId: room.roomId,
    fromUserId,
    toUserId,
    definitionId: row.definitionId,
    sourcePlugin: row.sourcePlugin,
    originalItemId: itemId,
    quantity: qty,
    metadata: row.metadata,
    itemName: def.name,
    createdAt: Date.now(),
  }
  room.pendingGifts.push(offer)
  room.notify()
  return { success: true, message: "Gift offered", offer }
}

export async function studioAcceptGift(params: {
  userId: string
  offerId: string
}): Promise<GiftActionResult> {
  const { room } = getStudio()
  const idx = room.pendingGifts.findIndex((o) => o.offerId === params.offerId)
  if (idx < 0) return { success: false, message: "Gift not found" }
  const offer = room.pendingGifts[idx]!
  if (offer.toUserId !== params.userId) {
    return { success: false, message: "This gift is not for you" }
  }
  if (!tradingAllowed(room)) {
    return { success: false, message: "Trading is not enabled for this session" }
  }

  const ok = await giveEscrowed(offer.toUserId, offer)
  if (!ok) {
    await giveEscrowed(offer.fromUserId, offer)
    room.pendingGifts.splice(idx, 1)
    room.notify()
    return { success: false, message: "Could not deliver gift (bag may be full)" }
  }
  room.pendingGifts.splice(idx, 1)
  room.notify()
  return { success: true, message: "Gift accepted", offer }
}

export async function studioDeclineOrCancelGift(params: {
  userId: string
  offerId: string
  asCancel: boolean
}): Promise<GiftActionResult> {
  const { room } = getStudio()
  const idx = room.pendingGifts.findIndex((o) => o.offerId === params.offerId)
  if (idx < 0) return { success: false, message: "Gift not found" }
  const offer = room.pendingGifts[idx]!
  const allowed = params.asCancel
    ? offer.fromUserId === params.userId
    : offer.toUserId === params.userId
  if (!allowed) {
    return {
      success: false,
      message: params.asCancel ? "Only the sender can cancel" : "Only the recipient can decline",
    }
  }

  await giveEscrowed(offer.fromUserId, offer)
  room.pendingGifts.splice(idx, 1)
  room.notify()
  return {
    success: true,
    message: params.asCancel ? "Gift cancelled" : "Gift declined",
    offer,
  }
}

export function studioTradeInvite(params: {
  fromUserId: string
  toUserId: string
}): TradeActionResult {
  const { room } = getStudio()
  const { fromUserId, toUserId } = params
  if (fromUserId === toUserId) {
    return { success: false, message: "You can't trade with yourself" }
  }
  if (!tradingAllowed(room)) {
    return { success: false, message: "Trading is not enabled for this session" }
  }
  expireStaleInvites(room)
  if (findTradeForUser(room, fromUserId)) {
    return { success: false, message: "You already have an active trade" }
  }
  if (findTradeForUser(room, toUserId)) {
    return { success: false, message: "That listener is already in a trade" }
  }
  if (room.pendingTradeInvites.some((i) => i.fromUserId === fromUserId)) {
    return { success: false, message: "You already have a pending trade invite" }
  }
  if (
    room.pendingTradeInvites.some(
      (i) => i.fromUserId === fromUserId && i.toUserId === toUserId,
    )
  ) {
    return { success: false, message: "You already invited that listener" }
  }

  const invite: TradeInvite = {
    inviteId: newId(),
    roomId: room.roomId,
    fromUserId,
    toUserId,
    createdAt: Date.now(),
  }
  room.pendingTradeInvites.push(invite)
  scheduleInviteExpiry(room, invite)
  room.notify()
  return { success: true, message: "Trade invite sent", invite }
}

export function studioTradeRespond(params: {
  userId: string
  tradeId: string
  accept: boolean
}): TradeActionResult {
  const { room } = getStudio()
  expireStaleInvites(room)
  const invite = room.pendingTradeInvites.find((i) => i.inviteId === params.tradeId)
  if (!invite) return { success: false, message: "Invite not found or expired" }
  if (invite.toUserId !== params.userId) {
    return { success: false, message: "This invite is not for you" }
  }

  if (!params.accept) {
    removeInvite(room, invite.inviteId)
    room.notify()
    return { success: true, message: "Trade declined", invite }
  }

  if (findTradeForUser(room, invite.fromUserId) || findTradeForUser(room, invite.toUserId)) {
    return { success: false, message: "One party is already in a trade" }
  }

  removeInvite(room, invite.inviteId)
  const now = Date.now()
  const trade: TradeSession = {
    tradeId: newId(),
    roomId: room.roomId,
    status: "open",
    fromUserId: invite.fromUserId,
    toUserId: invite.toUserId,
    participants: {
      [invite.fromUserId]: emptyParticipant(invite.fromUserId),
      [invite.toUserId]: emptyParticipant(invite.toUserId),
    },
    createdAt: now,
    updatedAt: now,
  }
  room.trades.set(trade.tradeId, trade)
  room.notify()
  return { success: true, message: "Trade started", trade }
}

export function studioTradeSetOffer(params: {
  userId: string
  tradeId: string
  items: { itemId: string; quantity: number }[]
}): TradeActionResult {
  const { room } = getStudio()
  const trade = room.trades.get(params.tradeId)
  if (!trade || trade.status !== "open") {
    return { success: false, message: "Trade is not open" }
  }
  const me = trade.participants[params.userId]
  if (!me) return { success: false, message: "You are not in this trade" }
  if (me.locked) return { success: false, message: "Unlock before changing your offer" }

  const bag = room.getInventory(params.userId)
  const byId = new Map(bag.map((i) => [i.itemId, i]))
  const draft: TradeDraftItem[] = []
  for (const row of params.items) {
    const qty = Math.max(1, Math.floor(row.quantity))
    const item = byId.get(row.itemId)
    if (!item) return { success: false, message: "Item not in your inventory" }
    const def = room.getDefinition(item.definitionId)
    if (!def?.tradeable) {
      return { success: false, message: `${def?.name ?? "Item"} can't be traded` }
    }
    if (qty > item.quantity) return { success: false, message: "Not enough quantity" }
    draft.push({
      itemId: row.itemId,
      quantity: qty,
      definitionId: item.definitionId,
      itemName: def.name,
      slotPool: slotPoolOf(def),
    })
  }

  me.draft = draft
  me.confirmed = false
  trade.updatedAt = Date.now()
  room.notify()
  return { success: true, message: "Offer updated", trade }
}

export function studioTradeSetMessage(params: {
  userId: string
  tradeId: string
  message: string
}): TradeActionResult {
  const { room } = getStudio()
  const trade = room.trades.get(params.tradeId)
  if (!trade || trade.status !== "open") {
    return { success: false, message: "Trade is not open" }
  }
  const me = trade.participants[params.userId]
  if (!me) return { success: false, message: "You are not in this trade" }

  const trimmed = params.message.trim().slice(0, TRADE_MESSAGE_MAX_LENGTH)
  me.message = trimmed.length > 0 ? trimmed : null
  trade.updatedAt = Date.now()
  room.notify()
  return { success: true, message: trimmed ? "Note updated" : "Note cleared", trade }
}

export function studioTradeTyping(params: {
  userId: string
  tradeId: string
  typing: boolean
}): TradeActionResult {
  const { room } = getStudio()
  const trade = room.trades.get(params.tradeId)
  if (!trade || trade.status !== "open") {
    return { success: false, message: "Trade is not open" }
  }
  if (!trade.participants[params.userId]) {
    return { success: false, message: "You are not in this trade" }
  }
  return { success: true, message: "Typing", trade }
}

async function refundOffer(
  userId: string,
  offer: TradeOfferItem[],
): Promise<Array<InventoryItem | null>> {
  const refunded: Array<InventoryItem | null> = []
  for (const row of offer) {
    refunded.push(await giveEscrowed(userId, row, "trade"))
  }
  return refunded
}

export async function studioTradeLock(params: {
  userId: string
  tradeId: string
}): Promise<TradeActionResult> {
  const { room, itemShopsContext } = getStudio()
  const trade = room.trades.get(params.tradeId)
  if (!trade || trade.status !== "open") {
    return { success: false, message: "Trade is not open" }
  }
  const me = trade.participants[params.userId]
  if (!me) return { success: false, message: "You are not in this trade" }
  if (me.locked) return { success: true, message: "Already locked", trade }

  const escrowed: TradeOfferItem[] = []
  for (const row of me.draft) {
    const bag = room.getInventory(params.userId)
    const item = bag.find((i) => i.itemId === row.itemId)
    if (!item) {
      await refundOffer(params.userId, escrowed)
      return { success: false, message: "An offered item is no longer available" }
    }
    const def = room.getDefinition(item.definitionId)
    if (!def?.tradeable) {
      await refundOffer(params.userId, escrowed)
      return { success: false, message: "An offered item can't be traded" }
    }
    const qty = Math.min(row.quantity, item.quantity)
    const removed = await itemShopsContext.inventory.removeItem(params.userId, row.itemId, qty)
    if (!removed) {
      await refundOffer(params.userId, escrowed)
      return { success: false, message: "Could not escrow offer" }
    }
    escrowed.push({
      escrowKey: newId(),
      originalItemId: row.itemId,
      definitionId: item.definitionId,
      sourcePlugin: item.sourcePlugin,
      quantity: qty,
      metadata: item.metadata,
      itemName: def.name,
      slotPool: slotPoolOf(def),
    })
  }

  me.offer = escrowed
  me.draft = []
  me.locked = true
  me.confirmed = false
  for (const p of Object.values(trade.participants)) {
    if (p.userId !== params.userId) p.confirmed = false
  }
  trade.updatedAt = Date.now()
  room.notify()
  return { success: true, message: "Offer locked", trade }
}

export async function studioTradeUnlock(params: {
  userId: string
  tradeId: string
}): Promise<TradeActionResult> {
  const { room } = getStudio()
  const trade = room.trades.get(params.tradeId)
  if (!trade || trade.status !== "open") {
    return { success: false, message: "Trade is not open" }
  }
  if (!trade.participants[params.userId]) {
    return { success: false, message: "You are not in this trade" }
  }

  for (const p of Object.values(trade.participants)) {
    const refunded = await refundOffer(p.userId, p.offer)
    p.draft = draftFromEscrowedOffer(
      p.offer,
      refunded.map((item) => item?.itemId),
    )
    p.offer = []
    p.locked = false
    p.confirmed = false
  }
  trade.updatedAt = Date.now()
  room.notify()
  return { success: true, message: "Trade unlocked", trade }
}

export async function studioTradeConfirm(params: {
  userId: string
  tradeId: string
}): Promise<TradeActionResult> {
  const { room } = getStudio()
  const trade = room.trades.get(params.tradeId)
  if (!trade || trade.status !== "open") {
    return { success: false, message: "Trade is not open" }
  }
  const me = trade.participants[params.userId]
  if (!me) return { success: false, message: "You are not in this trade" }
  if (!me.locked) return { success: false, message: "Lock your offer before confirming" }

  me.confirmed = true
  trade.updatedAt = Date.now()

  const parties = Object.values(trade.participants)
  if (!parties.every((p) => p.locked && p.confirmed)) {
    room.notify()
    return { success: true, message: "Waiting for other party", trade }
  }

  const [a, b] = parties
  if (!a || !b) return { success: false, message: "Invalid trade" }

  // Deliver each escrowed offer to the counterparty
  for (const row of a.offer) {
    const ok = await giveEscrowed(b.userId, row, "trade")
    if (!ok) {
      await refundOffer(a.userId, a.offer)
      await refundOffer(b.userId, b.offer)
      a.offer = []
      b.offer = []
      a.locked = false
      b.locked = false
      a.confirmed = false
      b.confirmed = false
      room.notify()
      return { success: false, message: "Could not complete trade (slot limits)" }
    }
  }
  for (const row of b.offer) {
    const ok = await giveEscrowed(a.userId, row, "trade")
    if (!ok) {
      // Best-effort: reverse A's delivery already done is hard; refund remaining B escrow
      await refundOffer(b.userId, b.offer)
      room.notify()
      return { success: false, message: "Could not complete trade (slot limits)" }
    }
  }

  trade.status = "completed"
  trade.updatedAt = Date.now()
  room.trades.delete(trade.tradeId)
  room.notify()
  return { success: true, message: "Trade completed", trade }
}

export async function studioTradeCancel(params: {
  userId: string
  tradeId: string
}): Promise<TradeActionResult> {
  const { room } = getStudio()
  expireStaleInvites(room)
  const invite = room.pendingTradeInvites.find((i) => i.inviteId === params.tradeId)
  if (invite) {
    if (invite.fromUserId === params.userId) {
      removeInvite(room, invite.inviteId)
      room.notify()
      return { success: true, message: "Invite cancelled", invite }
    }
    if (invite.toUserId === params.userId) {
      removeInvite(room, invite.inviteId)
      room.notify()
      return { success: true, message: "Trade declined", invite }
    }
    return { success: false, message: "You are not part of this invite" }
  }

  const trade = room.trades.get(params.tradeId)
  if (!trade) return { success: false, message: "Trade not found" }
  if (!trade.participants[params.userId]) {
    return { success: false, message: "You are not in this trade" }
  }
  if (trade.status === "completed" || trade.status === "cancelled") {
    return { success: false, message: "Trade already finished" }
  }

  for (const p of Object.values(trade.participants)) {
    await refundOffer(p.userId, p.offer)
  }
  trade.status = "cancelled"
  trade.updatedAt = Date.now()
  room.trades.delete(trade.tradeId)
  room.notify()
  return { success: true, message: "Trade cancelled", trade }
}

/** Clear gifts/trades/invites on session end (refund escrow). */
export async function studioCancelAllGiftsAndTrades(): Promise<void> {
  const { room } = getStudio()
  for (const offer of [...room.pendingGifts]) {
    await giveEscrowed(offer.fromUserId, offer)
  }
  room.pendingGifts = []
  for (const invite of [...room.pendingTradeInvites]) {
    removeInvite(room, invite.inviteId)
  }
  room.pendingTradeInvites = []
  for (const trade of [...room.trades.values()]) {
    for (const p of Object.values(trade.participants)) {
      await refundOffer(p.userId, p.offer)
    }
  }
  room.trades.clear()
  room.notify()
}

export type { GiftOffer, TradeInvite, TradeSession }
