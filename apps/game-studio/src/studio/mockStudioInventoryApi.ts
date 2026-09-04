import type {
  InventoryAcquisitionSource,
  InventoryItem,
  InventoryPluginAPI,
  ItemDefinition,
  ItemUseResult,
  UserInventory,
} from "@repo/types"
import { capForPool, resolveSlotPool } from "@repo/types"
import type { StudioRoom } from "./studioRoom"
import type { StudioPluginRegistry } from "./studioPluginRegistry"
import { DEFAULT_PLAYBACK_SLOTS } from "./buildSessionConfig"
import { newId } from "./id"

export class MockStudioInventoryApi implements InventoryPluginAPI {
  constructor(
    private readonly room: StudioRoom,
    private readonly registry: StudioPluginRegistry,
    private readonly pluginName: string,
  ) {}

  registerItemDefinitions(definitions: Array<Omit<ItemDefinition, "id" | "sourcePlugin">>): void {
    const full: ItemDefinition[] = definitions.map((d) => ({
      ...d,
      id: `${this.pluginName}:${d.shortId}`,
      sourcePlugin: this.pluginName,
    }))
    this.room.registerDefinitions(full)
  }

  async giveItem(
    userId: string,
    definitionId: string,
    quantity = 1,
    metadata?: Record<string, unknown>,
    _source: InventoryAcquisitionSource = "plugin",
    _knownInventory?: UserInventory,
    _options?: { restored?: boolean },
  ): Promise<InventoryItem | null> {
    if (quantity <= 0) return null
    const def = this.room.getDefinition(definitionId)
    if (!def) return null
    const session = this.room.activeSession
    if (!session) return null

    const maxSlots = session.config.maxInventorySlots
    const maxCollectionSlots = session.config.maxCollectionSlots
    const maxPlaybackSlots = session.config.maxPlaybackSlots ?? DEFAULT_PLAYBACK_SLOTS
    let inv = [...this.room.getInventory(userId)]

    if (def.stackable) {
      const existing = inv.find((i) => i.definitionId === definitionId && i.quantity < def.maxStack)
      if (existing) {
        const room = def.maxStack - existing.quantity
        const toAdd = Math.min(room, quantity)
        existing.quantity += toAdd
        this.room.setInventory(userId, inv)
        const remaining = quantity - toAdd
        if (remaining > 0) {
          return this.giveItem(userId, definitionId, remaining, metadata, _source)
        }
        return existing
      }
    }

    const pool = resolveSlotPool(def)
    const used = inv.filter((i) => {
      const d = this.room.getDefinition(i.definitionId)
      return resolveSlotPool(d) === pool
    }).length
    const cap = capForPool({ maxSlots, maxCollectionSlots, maxPlaybackSlots }, pool)
    if (used >= cap) return null

    const item: InventoryItem = {
      itemId: newId(),
      definitionId,
      sourcePlugin: def.sourcePlugin,
      quantity: def.stackable ? Math.min(quantity, def.maxStack) : 1,
      acquiredAt: Date.now(),
      metadata,
    }
    inv.push(item)
    this.room.setInventory(userId, inv)

    if (!def.stackable && quantity > 1) {
      await this.giveItem(userId, definitionId, quantity - 1, metadata, _source)
    }
    if (def.stackable && quantity > item.quantity) {
      await this.giveItem(userId, definitionId, quantity - item.quantity, metadata, _source)
    }

    return item
  }

  async removeItem(
    userId: string,
    itemId: string,
    quantity = 1,
    _options?: { degraded?: boolean },
  ): Promise<boolean> {
    if (quantity <= 0) return false
    const inv = [...this.room.getInventory(userId)]
    const idx = inv.findIndex((i) => i.itemId === itemId)
    if (idx === -1) return false
    const row = inv[idx]!
    row.quantity -= quantity
    if (row.quantity <= 0) {
      inv.splice(idx, 1)
    } else {
      inv[idx] = row
    }
    this.room.setInventory(userId, inv)
    return true
  }

  async updateItemMetadata(
    userId: string,
    itemId: string,
    patch: Record<string, unknown>,
  ): Promise<InventoryItem | null> {
    const inv = [...this.room.getInventory(userId)]
    const idx = inv.findIndex((i) => i.itemId === itemId)
    if (idx === -1) return null
    const row = inv[idx]!
    const updated: InventoryItem = {
      ...row,
      metadata: { ...row.metadata, ...patch },
    }
    inv[idx] = updated
    this.room.setInventory(userId, inv)
    return updated
  }

  async transferItem(
    fromUserId: string,
    toUserId: string,
    itemId: string,
    quantity = 1,
  ): Promise<boolean> {
    if (quantity <= 0 || fromUserId === toUserId) return false
    const session = this.room.activeSession
    if (!session?.config.allowTrading) return false

    const fromInv = [...this.room.getInventory(fromUserId)]
    const idx = fromInv.findIndex((i) => i.itemId === itemId)
    if (idx < 0) return false
    const row = fromInv[idx]!
    const def = this.room.getDefinition(row.definitionId)
    if (!def?.tradeable) return false

    const qty = Math.min(quantity, row.quantity)
    row.quantity -= qty
    if (row.quantity <= 0) fromInv.splice(idx, 1)
    else fromInv[idx] = row
    this.room.setInventory(fromUserId, fromInv)

    const given = await this.giveItem(toUserId, row.definitionId, qty, row.metadata, "trade")
    if (!given) {
      await this.giveItem(fromUserId, row.definitionId, qty, row.metadata, "trade")
      return false
    }
    return true
  }

  async useItem(userId: string, itemId: string, callContext?: unknown): Promise<ItemUseResult> {
    const inv = this.room.getInventory(userId)
    const item = inv.find((i) => i.itemId === itemId)
    if (!item) {
      return { success: false, consumed: false, message: "Item not found in inventory" }
    }
    const def = this.room.getDefinition(item.definitionId)
    if (!def) {
      return { success: false, consumed: false, message: "Item definition not found" }
    }
    const result = await this.registry.invokeOnItemUsed(
      this.room,
      def.sourcePlugin,
      userId,
      item,
      def,
      callContext,
    )
    if (!result) {
      return {
        success: false,
        consumed: false,
        message: `${def.sourcePlugin} does not handle item use`,
      }
    }
    if (result.consumed) {
      await this.removeItem(userId, itemId, 1)
    }
    return result
  }

  async getInventory(userId: string): Promise<UserInventory> {
    const session = this.room.activeSession
    const maxSlots = session?.config.maxInventorySlots ?? 0
    const maxCollectionSlots = session?.config.maxCollectionSlots ?? 0
    const maxPlaybackSlots = session
      ? (session.config.maxPlaybackSlots ?? DEFAULT_PLAYBACK_SLOTS)
      : 0
    return {
      userId,
      items: [...this.room.getInventory(userId)],
      maxSlots,
      maxCollectionSlots,
      maxPlaybackSlots,
    }
  }

  async hasItem(userId: string, definitionId: string, minQuantity = 1): Promise<boolean> {
    const inv = this.room.getInventory(userId)
    let total = 0
    for (const row of inv) {
      if (row.definitionId === definitionId) {
        total += row.quantity
        if (total >= minQuantity) return true
      }
    }
    return false
  }

  async getItemDefinition(definitionId: string): Promise<ItemDefinition | null> {
    return this.room.getDefinition(definitionId)
  }

  async getItemDefinitions(definitionIds: readonly string[]): Promise<ItemDefinition[]> {
    const out: ItemDefinition[] = []
    for (const id of definitionIds) {
      const def = this.room.getDefinition(id)
      if (def) out.push(def)
    }
    return out
  }

  async getAllItemDefinitions(): Promise<ItemDefinition[]> {
    return [...this.room.definitions.values()]
  }
}
