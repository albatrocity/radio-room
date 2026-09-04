import type {
  InventoryItem,
  ItemDefinition,
  ItemSlotPool,
  TradeOfferItem,
  TradeInventoryTransfer,
} from "@repo/types"
import { capForPool, resolveSlotPool } from "@repo/types"
import type { InventoryService } from "../InventoryService"

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
}): Promise<Array<InventoryItem | null>> {
  const inv = params.inventory
  if (!inv) return params.offer.map(() => null)
  const refunded: Array<InventoryItem | null> = []
  for (const e of params.offer) {
    if (!e.definitionId) {
      refunded.push(null)
      continue
    }
    const item = await inv.giveItem(
      params.roomId,
      params.userId,
      e.definitionId,
      e.quantity,
      e.metadata,
      "trade",
    )
    if (!item) {
      console.error(`[TradeService] refund failed ${params.userId} ${e.definitionId}`)
    }
    refunded.push(item)
  }
  return refunded
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

  const used: Record<ItemSlotPool, number> = { inventory: 0, collection: 0, playback: 0 }
  for (const item of bag.items) {
    used[resolveSlotPool(byId.get(item.definitionId))] += 1
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
      const pool = resolveSlotPool(def)
      if (used[pool] >= capForPool(bag, pool)) return false
      used[pool] += 1
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
