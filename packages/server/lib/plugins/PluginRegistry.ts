import { AppContext, Plugin, PluginContext, PluginLifecycleEvents, Room } from "@repo/types"
import { Server } from "socket.io"
import { PluginAPIImpl } from "./PluginAPI"
import { PluginStorageImpl } from "./PluginStorage"
import { PluginLifecycleImpl } from "./PluginLifecycle"

/**
 * Central registry for all plugins
 * Manages plugin lifecycle and event distribution
 */
export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map()
  private roomPlugins: Map<string, Map<string, PluginLifecycleImpl>> = new Map()
  private api: PluginAPIImpl

  constructor(
    private context: AppContext,
    private io: Server,
  ) {
    this.api = new PluginAPIImpl(context, io)
  }

  /**
   * Register a plugin globally
   */
  registerPlugin(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin)
    console.log(`[PluginRegistry] Registered plugin: ${plugin.name} v${plugin.version}`)
  }

  /**
   * Initialize a plugin for a specific room
   * Creates plugin context and calls plugin's register method
   */
  async initializePluginForRoom(pluginName: string, roomId: string): Promise<void> {
    const plugin = this.plugins.get(pluginName)

    if (!plugin) {
      throw new Error(`Plugin ${pluginName} not found`)
    }

    // Check if plugin is already initialized for this room
    if (this.roomPlugins.has(roomId) && this.roomPlugins.get(roomId)?.has(pluginName)) {
      console.log(`[PluginRegistry] Plugin ${pluginName} already initialized for room ${roomId}`)
      return
    }

    const lifecycle = new PluginLifecycleImpl()
    const storage = new PluginStorageImpl(this.context, pluginName, roomId)

    const pluginContext: PluginContext = {
      roomId,
      api: this.api,
      storage,
      lifecycle,
      getRoom: async () => {
        const { findRoom } = await import("../../operations/data")
        const room = await findRoom({ context: this.context, roomId })
        return room ?? null
      },
      appContext: this.context,
    }

    try {
      await plugin.register(pluginContext)

      // Store the lifecycle for this room+plugin combo
      if (!this.roomPlugins.has(roomId)) {
        this.roomPlugins.set(roomId, new Map())
      }
      this.roomPlugins.get(roomId)!.set(pluginName, lifecycle)

      console.log(`[PluginRegistry] Initialized plugin ${pluginName} for room ${roomId}`)
    } catch (error) {
      console.error(
        `[PluginRegistry] Error initializing plugin ${pluginName} for room ${roomId}:`,
        error,
      )
      throw error
    }
  }

  /**
   * Cleanup a plugin for a specific room
   */
  async cleanupPluginForRoom(pluginName: string, roomId: string): Promise<void> {
    const plugin = this.plugins.get(pluginName)

    if (!plugin) {
      return
    }

    try {
      await plugin.cleanup()

      // Remove lifecycle handlers
      const roomPluginMap = this.roomPlugins.get(roomId)
      if (roomPluginMap) {
        const lifecycle = roomPluginMap.get(pluginName)
        if (lifecycle) {
          lifecycle.clear()
        }
        roomPluginMap.delete(pluginName)

        if (roomPluginMap.size === 0) {
          this.roomPlugins.delete(roomId)
        }
      }

      // Cleanup storage
      const storage = new PluginStorageImpl(this.context, pluginName, roomId)
      await storage.cleanup()

      console.log(`[PluginRegistry] Cleaned up plugin ${pluginName} for room ${roomId}`)
    } catch (error) {
      console.error(
        `[PluginRegistry] Error cleaning up plugin ${pluginName} for room ${roomId}:`,
        error,
      )
    }
  }

  /**
   * Cleanup all plugins for a room
   */
  async cleanupRoom(roomId: string): Promise<void> {
    const roomPluginMap = this.roomPlugins.get(roomId)

    if (!roomPluginMap) {
      return
    }

    const pluginNames = Array.from(roomPluginMap.keys())

    for (const pluginName of pluginNames) {
      await this.cleanupPluginForRoom(pluginName, roomId)
    }
  }

  /**
   * Emit a lifecycle event to all plugins in a room
   */
  async emit<K extends keyof PluginLifecycleEvents>(
    roomId: string,
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): Promise<void> {
    const roomPluginMap = this.roomPlugins.get(roomId)

    if (!roomPluginMap || roomPluginMap.size === 0) {
      console.log(`[PluginRegistry] No plugins found for room ${roomId}, skipping event ${event}`)
      return
    }

    console.log(
      `[PluginRegistry] Emitting ${event} to ${roomPluginMap.size} plugin(s) in room ${roomId}`,
    )

    // Emit to all plugins in this room
    const promises = Array.from(roomPluginMap.values()).map((lifecycle) =>
      lifecycle.emit(event, data),
    )

    await Promise.allSettled(promises)
  }

  /**
   * Sync plugins for a room
   * Initializes all registered plugins for the room if not already initialized
   */
  async syncRoomPlugins(roomId: string, room: Room, previousRoom?: Room): Promise<void> {
    console.log(`[PluginRegistry] Syncing plugins for room ${roomId}`)
    console.log(`[PluginRegistry] Registered plugins:`, Array.from(this.plugins.keys()))

    for (const [pluginName] of Array.from(this.plugins.entries())) {
      const isActive = this.roomPlugins.get(roomId)?.has(pluginName) ?? false

      console.log(`[PluginRegistry] Plugin ${pluginName}: isActive=${isActive}`)

      if (!isActive) {
        // Initialize the plugin - let it decide what to do based on its config
        console.log(`[PluginRegistry] Initializing plugin ${pluginName} for room ${roomId}`)
        await this.initializePluginForRoom(pluginName, roomId)
      }
    }
  }

  /**
   * Get plugin configuration from namespaced storage
   */
  private async getPluginConfig(pluginName: string, room: Room): Promise<any> {
    const { getPluginConfig } = await import("../../operations/data/pluginConfigs")
    return await getPluginConfig({
      context: this.context,
      roomId: room.id,
      pluginName,
    })
  }

  /**
   * Get debug info about registered plugins
   */
  getDebugInfo(): any {
    const info: any = {
      registeredPlugins: Array.from(this.plugins.keys()),
      rooms: {},
    }

    for (const [roomId, pluginMap] of Array.from(this.roomPlugins.entries())) {
      info.rooms[roomId] = {
        activePlugins: Array.from(pluginMap.keys()),
        handlerCounts: {},
      }

      for (const [pluginName, lifecycle] of Array.from(pluginMap.entries())) {
        info.rooms[roomId].handlerCounts[pluginName] = lifecycle.getHandlerCounts()
      }
    }

    return info
  }
}
