import {
  AppContext,
  InventoryAcquisitionSource,
  InventoryItem,
  InventoryPluginAPI,
  ItemDefinition,
  ItemUseResult,
  UserInventory,
} from "@repo/types"
import { InventoryService } from "../../services/InventoryService"

/**
 * Per-plugin, per-room view onto the {@link InventoryService}.
 *
 * Plugins receive this as `context.inventory`. Item registration is scoped to
 * the calling plugin (the `sourcePlugin` is filled in automatically), and
 * mutations honour the active session's inventory settings.
 */
export class PluginInventoryAPI implements InventoryPluginAPI {
  constructor(
    private readonly context: AppContext,
    private readonly pluginName: string,
    private readonly roomId: string,
  ) {}

  private get service(): InventoryService | null {
    return (this.context.inventory as InventoryService | undefined) ?? null
  }

  registerItemDefinitions(
    definitions: Array<Omit<ItemDefinition, "id" | "sourcePlugin">>,
  ): void {
    if (!this.service) return
    this.service
      .registerItemDefinitions(this.roomId, this.pluginName, definitions)
      .catch((err) => {
        console.error(
          `[PluginInventoryAPI] registerItemDefinitions failed for ${this.pluginName}:`,
          err,
        )
      })
  }

  async giveItem(
    userId: string,
    definitionId: string,
    quantity?: number,
    metadata?: Record<string, unknown>,
    source: InventoryAcquisitionSource = "plugin",
  ): Promise<InventoryItem | null> {
    if (!this.service) return null
    return this.service.giveItem(this.roomId, userId, definitionId, quantity, metadata, source)
  }

  async removeItem(userId: string, itemId: string, quantity?: number): Promise<boolean> {
    if (!this.service) return false
    return this.service.removeItem(this.roomId, userId, itemId, quantity)
  }

  async transferItem(
    fromUserId: string,
    toUserId: string,
    itemId: string,
    quantity?: number,
  ): Promise<boolean> {
    if (!this.service) return false
    return this.service.transferItem(this.roomId, fromUserId, toUserId, itemId, quantity)
  }

  async useItem(userId: string, itemId: string, callContext?: unknown): Promise<ItemUseResult> {
    if (!this.service) {
      return { success: false, consumed: false, message: "Inventory service unavailable" }
    }
    return this.service.useItem(this.roomId, userId, itemId, callContext)
  }

  async getInventory(userId: string): Promise<UserInventory> {
    if (!this.service) {
      return { userId, items: [], maxSlots: 0 }
    }
    return this.service.getInventory(this.roomId, userId)
  }

  async hasItem(userId: string, definitionId: string, minQuantity?: number): Promise<boolean> {
    if (!this.service) return false
    return this.service.hasItem(this.roomId, userId, definitionId, minQuantity)
  }

  async getItemDefinition(definitionId: string): Promise<ItemDefinition | null> {
    if (!this.service) return null
    return this.service.getItemDefinition(this.roomId, definitionId)
  }

  async getAllItemDefinitions(): Promise<ItemDefinition[]> {
    if (!this.service) return []
    return this.service.getAllItemDefinitions(this.roomId)
  }
}
