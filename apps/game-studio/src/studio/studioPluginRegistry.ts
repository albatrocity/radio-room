import type {
  InventoryItem,
  ItemDefinition,
  ItemSellResult,
  ItemUseResult,
  Plugin,
} from "@repo/types"
import type { StudioRoom } from "./studioRoom"

/**
 * Minimal per-room plugin map for inventory dispatch (mirrors `PluginRegistry` hooks).
 */
export class StudioPluginRegistry {
  private roomPlugins = new Map<string, Map<string, Plugin>>()

  list(roomId: string): Plugin[] {
    const m = this.roomPlugins.get(roomId)
    return m ? [...m.values()] : []
  }

  register(roomId: string, pluginName: string, plugin: Plugin): void {
    let m = this.roomPlugins.get(roomId)
    if (!m) {
      m = new Map()
      this.roomPlugins.set(roomId, m)
    }
    m.set(pluginName, plugin)
  }

  get(roomId: string, pluginName: string): Plugin | undefined {
    return this.roomPlugins.get(roomId)?.get(pluginName)
  }

  async invokeOnItemUsed(
    room: StudioRoom,
    pluginName: string,
    userId: string,
    item: InventoryItem,
    definition: ItemDefinition,
    callContext: unknown,
  ): Promise<ItemUseResult | null> {
    const instance = this.get(room.roomId, pluginName)
    if (!instance?.onItemUsed) return null
    try {
      return await instance.onItemUsed(userId, item, definition, callContext)
    } catch (error) {
      console.error(`[StudioPluginRegistry] onItemUsed error:`, error)
      return { success: false, consumed: false, message: String(error) }
    }
  }

  async invokeOnItemSold(
    room: StudioRoom,
    pluginName: string,
    userId: string,
    item: InventoryItem,
    definition: ItemDefinition,
    callContext: unknown,
  ): Promise<ItemSellResult | null> {
    const instance = this.get(room.roomId, pluginName)
    if (!instance?.onItemSold) return null
    try {
      return await instance.onItemSold(userId, item, definition, callContext)
    } catch (error) {
      console.error(`[StudioPluginRegistry] onItemSold error:`, error)
      return { success: false, message: String(error) }
    }
  }

  async executePluginAction(
    roomId: string,
    pluginName: string,
    action: string,
    initiator?: import("@repo/types").PluginActionInitiator,
  ): Promise<{ success: boolean; message?: string }> {
    const instance = this.get(roomId, pluginName)
    if (!instance?.executeAction) {
      return { success: false, message: "Unknown action" }
    }
    return instance.executeAction(action, initiator)
  }
}
