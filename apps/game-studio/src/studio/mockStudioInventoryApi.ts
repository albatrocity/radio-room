import type {
  InventoryAcquisitionSource,
  InventoryItem,
  InventoryPluginAPI,
  ItemDefinition,
  ItemUseResult,
  UserInventory,
} from "@repo/types"
import type { StudioRoom } from "./studioRoom"
import type { StudioPluginRegistry } from "./studioPluginRegistry"
import { newId } from "./id"

export class MockStudioInventoryApi implements InventoryPluginAPI {
  constructor(
    private readonly room: StudioRoom,
    private readonly registry: StudioPluginRegistry,
    private readonly pluginName: string,
  ) {}

  registerItemDefinitions(
    definitions: Array<Omit<ItemDefinition, "id" | "sourcePlugin">>,
  ): void {
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
  ): Promise<InventoryItem | null> {
    if (quantity <= 0) return null
    const def = this.room.getDefinition(definitionId)
    if (!def) return null
    const session = this.room.activeSession
    if (!session) return null

    const maxSlots = session.config.maxInventorySlots
    let inv = [...this.room.getInventory(userId)]

    if (def.stackable) {
      const existing = inv.find(
        (i) => i.definitionId === definitionId && i.quantity < def.maxStack,
      )
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

    if (inv.length >= maxSlots) return null

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

  async removeItem(userId: string, itemId: string, quantity = 1): Promise<boolean> {
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

  async transferItem(
    _fromUserId: string,
    _toUserId: string,
    _itemId: string,
    _quantity?: number,
  ): Promise<boolean> {
    return false
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
    return { userId, items: [...this.room.getInventory(userId)], maxSlots }
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

  async getAllItemDefinitions(): Promise<ItemDefinition[]> {
    return [...this.room.definitions.values()]
  }
}
