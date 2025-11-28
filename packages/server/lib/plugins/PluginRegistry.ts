import {
  AppContext,
  Plugin,
  PluginContext,
  PluginLifecycleEvents,
  PluginSchemaInfo,
  Room,
  QueueItem,
} from "@repo/types"
import { Server } from "socket.io"
import { PluginAPIImpl } from "./PluginAPI"
import { PluginStorageImpl } from "./PluginStorage"
import { PluginLifecycleImpl } from "./PluginLifecycle"

/**
 * Plugin factory function - creates a new plugin instance
 */
export type PluginFactory = () => Plugin

/**
 * Room-scoped plugin instance with its lifecycle
 */
interface RoomPluginInstance {
  plugin: Plugin
  lifecycle: PluginLifecycleImpl
}

/**
 * Central registry for all plugins
 * Manages plugin lifecycle and event distribution
 *
 * ARCHITECTURE: Each room gets its own plugin instance.
 * - Plugin factories are registered globally
 * - When a room needs a plugin, a new instance is created from the factory
 * - Each plugin instance only handles ONE room
 * - This simplifies plugin code: handlers can use `this.context` directly
 */
export class PluginRegistry {
  /** Plugin factories keyed by plugin name */
  private pluginFactories: Map<string, PluginFactory> = new Map()

  /** Room-scoped plugin instances: roomId -> pluginName -> instance */
  private roomPlugins: Map<string, Map<string, RoomPluginInstance>> = new Map()

  private api: PluginAPIImpl

  constructor(
    private context: AppContext,
    private io: Server,
  ) {
    this.api = new PluginAPIImpl(context, io)
  }

  /**
   * Register a plugin factory globally.
   * The factory will be called to create a new instance for each room.
   */
  registerPlugin(factory: PluginFactory): void {
    // Create a temporary instance to get the name and version
    const tempInstance = factory()
    this.pluginFactories.set(tempInstance.name, factory)
    console.log(`[PluginRegistry] Registered plugin factory: ${tempInstance.name} v${tempInstance.version}`)
  }

  /**
   * Initialize a plugin for a specific room.
   * Creates a NEW plugin instance from the factory.
   */
  async initializePluginForRoom(pluginName: string, roomId: string): Promise<void> {
    const factory = this.pluginFactories.get(pluginName)

    if (!factory) {
      throw new Error(`Plugin factory ${pluginName} not found`)
    }

    // Check if plugin is already initialized for this room
    if (this.roomPlugins.has(roomId) && this.roomPlugins.get(roomId)?.has(pluginName)) {
      console.log(`[PluginRegistry] Plugin ${pluginName} already initialized for room ${roomId}`)
      return
    }

    // Create a NEW plugin instance for this room
    const plugin = factory()
    const lifecycle = new PluginLifecycleImpl()
    const storage = new PluginStorageImpl(this.context, pluginName, roomId)

    // Create a scoped API that knows the plugin name and roomId for event namespacing
    const scopedApi = this.api.forPlugin(pluginName, roomId)

    const pluginContext: PluginContext = {
      roomId,
      api: scopedApi,
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

      // Store the plugin instance and lifecycle for this room
      if (!this.roomPlugins.has(roomId)) {
        this.roomPlugins.set(roomId, new Map())
      }
      this.roomPlugins.get(roomId)!.set(pluginName, { plugin, lifecycle })

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
    const roomPluginMap = this.roomPlugins.get(roomId)
    const instance = roomPluginMap?.get(pluginName)

    if (!instance) {
      return
    }

    try {
      // Cleanup the plugin instance
      await instance.plugin.cleanup()

      // Clear lifecycle handlers
      instance.lifecycle.clear()

      // Remove from map
      roomPluginMap?.delete(pluginName)

      if (roomPluginMap?.size === 0) {
        this.roomPlugins.delete(roomId)
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
    const promises = Array.from(roomPluginMap.values()).map(({ lifecycle }) =>
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
    console.log(`[PluginRegistry] Registered plugins:`, Array.from(this.pluginFactories.keys()))

    for (const pluginName of this.pluginFactories.keys()) {
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
   * Augment playlist items with plugin metadata
   * Calls augmentPlaylistBatch on all plugins that implement it
   *
   * @param roomId - The room to augment playlist for
   * @param items - Array of playlist items to augment
   * @returns Items with merged pluginData from all plugins
   */
  async augmentPlaylistItems(roomId: string, items: QueueItem[]): Promise<QueueItem[]> {
    if (items.length === 0) {
      return items
    }

    const roomPluginMap = this.roomPlugins.get(roomId)
    if (!roomPluginMap) {
      return items
    }

    // Get plugins for this room that have augmentation
    const pluginsWithAugmentation = Array.from(roomPluginMap.entries()).filter(
      ([, { plugin }]) => typeof plugin.augmentPlaylistBatch === "function",
    )

    if (pluginsWithAugmentation.length === 0) {
      return items
    }

    // Call all augmentation methods in parallel
    const augmentationResults = await Promise.all(
      pluginsWithAugmentation.map(async ([pluginName, { plugin }]) => {
        try {
          const augmentations = await plugin.augmentPlaylistBatch!(items)
          return { pluginName, augmentations }
        } catch (error) {
          console.error(
            `[PluginRegistry] Error in augmentPlaylistBatch for plugin ${pluginName}:`,
            error,
          )
          return { pluginName, augmentations: items.map(() => ({})) }
        }
      }),
    )

    // Merge augmentation data into items
    return items.map((item, index) => {
      const pluginData: Record<string, any> = { ...(item.pluginData || {}) }

      for (const { pluginName, augmentations } of augmentationResults) {
        const augmentation = augmentations[index]
        if (augmentation && Object.keys(augmentation).length > 0) {
          pluginData[pluginName] = augmentation
        }
      }

      // Only add pluginData if there's data to add
      if (Object.keys(pluginData).length > 0) {
        return { ...item, pluginData }
      }
      return item
    })
  }

  /**
   * Augment a single playlist item with plugin metadata
   * Convenience method for single-item augmentation (e.g., PLAYLIST_TRACK_ADDED)
   */
  async augmentPlaylistItem(roomId: string, item: QueueItem): Promise<QueueItem> {
    const [augmented] = await this.augmentPlaylistItems(roomId, [item])
    return augmented
  }

  /**
   * Get debug info about registered plugins
   */
  getDebugInfo(): any {
    const info: any = {
      registeredPlugins: Array.from(this.pluginFactories.keys()),
      rooms: {},
    }

    for (const [roomId, pluginMap] of Array.from(this.roomPlugins.entries())) {
      info.rooms[roomId] = {
        activePlugins: Array.from(pluginMap.keys()),
        handlerCounts: {},
      }

      for (const [pluginName, { lifecycle }] of Array.from(pluginMap.entries())) {
        info.rooms[roomId].handlerCounts[pluginName] = lifecycle.getHandlerCounts()
      }
    }

    return info
  }

  /**
   * Get schema information for all registered plugins.
   * Used by the API endpoint to expose plugin schemas to the frontend.
   */
  getPluginSchemas(): PluginSchemaInfo[] {
    const schemas: PluginSchemaInfo[] = []

    for (const [, factory] of this.pluginFactories) {
      // Create a temporary instance to get schema info
      const tempInstance = factory()
      schemas.push({
        name: tempInstance.name,
        version: tempInstance.version,
        description: tempInstance.description,
        defaultConfig: tempInstance.getDefaultConfig?.(),
        configSchema: tempInstance.getConfigSchema?.(),
      })
    }

    return schemas
  }

  /**
   * Get schema information for a specific plugin.
   * Returns null if the plugin is not registered.
   */
  getPluginSchema(pluginName: string): PluginSchemaInfo | null {
    const factory = this.pluginFactories.get(pluginName)
    if (!factory) return null

    // Create a temporary instance to get schema info
    const tempInstance = factory()
    return {
      name: tempInstance.name,
      version: tempInstance.version,
      description: tempInstance.description,
      defaultConfig: tempInstance.getDefaultConfig?.(),
      configSchema: tempInstance.getConfigSchema?.(),
    }
  }
}
