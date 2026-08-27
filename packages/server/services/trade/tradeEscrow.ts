import type { InventoryItem, ItemDefinition, TradeOfferItem, TradeInventoryTransfer } from "@repo/types"
import type { InventoryService } from "../InventoryService"
import { slotPoolOf } from "./tradeKeys"

export async function deliverOffer(params: {
  inventory: InventoryService
  roomId: string
  fromUserId: string
  toUserId: string
  offer: TradeOfferItem[]
}): Promise<TradeInventoryTransfer[]> {
  const transfers: TradeInventoryTransfer[] = []
  for (const e of params.offer) {
    const given = await params.inventory.giveItem(
      params.roomId,
      params.toUserId,
      e.definitionId,
      e.quantity,
      e.metadata,
      "trade",
    )
    if (!given) {
      console.error("[TradeService] deliverOffer failed", e.definitionId, params.toUserId)
      continue
    }
    transfers.push({
      fromUserId: params.fromUserId,
      toUserId: params.toUserId,
      item: given,
      quantity: e.quantity,
    })
  }
  return transfers
}

export async function refundEscrow(params: {
  inventory: InventoryService | null
  roomId: string
  userId: string
  offer: TradeOfferItem[]
}): Promise<void> {
  const inv = params.inventory
  if (!inv) return
  for (const e of params.offer) {
    if (!e.definitionId) continue
    const refunded = await inv.giveItem(
      params.roomId,
      params.userId,
      e.definitionId,
      e.quantity,
      e.metadata,
      "trade",
    )
    if (!refunded) {
      console.error(`[TradeService] refund failed ${params.userId} ${e.definitionId}`)
    }
  }
}

export async function canAccommodateOfferList(params: {
  inventory: InventoryService
  roomId: string
  userId: string
  incoming: TradeOfferItem[]
}): Promise<boolean> {
  const { inventory: inv, roomId, userId, incoming } = params
  const bag = await inv.getInventory(roomId, userId)
  const bagIds = bag.items.map((item) => item.definitionId)
  const incomingIds = incoming.map((e) => e.definitionId)
  const defs = await inv.getItemDefinitions(roomId, [...bagIds, ...incomingIds])
  const byId = new Map(defs.map((d) => [d.id, d]))

  let invUsed = 0
  let colUsed = 0
  for (const item of bag.items) {
    if (slotPoolOf(byId.get(item.definitionId)) === "collection") colUsed += 1
    else invUsed += 1
  }

  const stacks: InventoryItem[] = bag.items.map((i) => ({ ...i }))

  for (const e of incoming) {
    const def: ItemDefinition | null = byId.get(e.definitionId) ?? null
    if (!def) return false
    let remaining = e.quantity
    if (def.stackable) {
      for (const s of stacks) {
        if (s.definitionId !== e.definitionId) continue
        const room = def.maxStack - s.quantity
        if (room <= 0) continue
        const add = Math.min(room, remaining)
        s.quantity += add
        remaining -= add
        if (remaining <= 0) break
      }
    }
    while (remaining > 0) {
      const pool = slotPoolOf(def)
      if (pool === "collection") {
        if (colUsed >= bag.maxCollectionSlots) return false
        colUsed += 1
      } else {
        if (invUsed >= bag.maxSlots) return false
        invUsed += 1
      }
      const take = def.stackable ? Math.min(remaining, def.maxStack) : 1
      stacks.push({
        itemId: `sim-${stacks.length}`,
        definitionId: e.definitionId,
        sourcePlugin: e.sourcePlugin,
        quantity: take,
        acquiredAt: 0,
      })
      remaining -= take
    }
  }
  return true
}
