import type { AppContext, Plugin, PluginContext } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { createItemShopsPlugin, defaultItemShopsConfig } from "@repo/plugin-item-shops"
import { createMockPluginStorage } from "./mockPluginStorage"
import { MockPluginLifecycle } from "./mockLifecycle"
import { MockStudioGameSessionApi } from "./mockStudioGameApi"
import { MockStudioInventoryApi } from "./mockStudioInventoryApi"
import { MockStudioPluginApi } from "./mockStudioPluginApi"
import { StudioPluginRegistry } from "./studioPluginRegistry"
import { attachStudioPersistence, tryHydrateRoom } from "./studioPersistence"
import { StudioRoom } from "./studioRoom"

export type StudioBootstrap = {
  room: StudioRoom
  lifecycle: MockPluginLifecycle
  registry: StudioPluginRegistry
  itemShopsPlugin: Plugin
  itemShopsContext: PluginContext
}

function stubAppContext(registry: StudioPluginRegistry): AppContext {
  return {
    redis: {
      pubClient: {} as never,
      subClient: {} as never,
    },
    adapters: {
      playbackControllers: new Map(),
      metadataSources: new Map(),
      mediaSources: new Map(),
      serviceAuth: new Map(),
      playbackControllerModules: new Map(),
      metadataSourceModules: new Map(),
      mediaSourceModules: new Map(),
    },
    jobs: [],
    pluginRegistry: registry,
  } as AppContext
}

export async function bootstrapStudio(): Promise<StudioBootstrap> {
  const room = new StudioRoom()
  const lifecycle = new MockPluginLifecycle()
  const registry = new StudioPluginRegistry()

  const pluginName = ITEM_SHOPS_PLUGIN_NAME
  room.setPluginConfig(pluginName, {
    ...defaultItemShopsConfig,
    enabled: true,
  })

  const itemShopsPlugin = createItemShopsPlugin({ enabled: true, assignShopOnJoin: true })

  const pluginApi = new MockStudioPluginApi(room, lifecycle, pluginName)
  const gameApi = new MockStudioGameSessionApi(room, lifecycle, pluginName)
  const inventoryApi = new MockStudioInventoryApi(room, registry, pluginName)

  registry.register(room.roomId, pluginName, itemShopsPlugin)

  const storage = createMockPluginStorage(room.ensurePluginStore(pluginName), () => room.notify())

  const ctx: PluginContext = {
    roomId: room.roomId,
    api: pluginApi,
    storage,
    lifecycle,
    game: gameApi,
    inventory: inventoryApi,
    getRoom: async () => ({
      id: room.roomId,
      creator: "studio",
      type: "jukebox",
      title: "Game Studio",
      fetchMeta: false,
      extraInfo: undefined,
      password: null,
      enableSpotifyLogin: false,
      deputizeOnJoin: false,
      createdAt: new Date().toISOString(),
      lastRefreshedAt: new Date().toISOString(),
      playbackMode: "app-controlled",
    }),
    appContext: stubAppContext(registry),
  }

  await itemShopsPlugin.register(ctx)

  tryHydrateRoom(room)
  attachStudioPersistence(room)

  return { room, lifecycle, registry, itemShopsPlugin, itemShopsContext: ctx }
}
