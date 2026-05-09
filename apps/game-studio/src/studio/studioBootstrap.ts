import type { AppContext, Plugin, PluginContext } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import {
  createItemShopsPlugin,
  defaultItemShopsConfig,
  ITEM_CATALOG,
  SHOP_CATALOG,
} from "@repo/plugin-item-shops"
import { MockStudioArtifactsApi } from "./mockStudioArtifactsApi"
import { createMockPluginStorage } from "./mockPluginStorage"
import { MockPluginLifecycle } from "./mockLifecycle"
import { MockStudioGameSessionApi } from "./mockStudioGameApi"
import { MockStudioInventoryApi } from "./mockStudioInventoryApi"
import { MockStudioPluginApi } from "./mockStudioPluginApi"
import { StudioPluginRegistry } from "./studioPluginRegistry"
import { STUDIO_SESSION_AFTER_RESET_KEY } from "./constants"
import { attachStudioPersistence, tryHydrateRoom } from "./studioPersistence"
import { seedStudioSampleQueueIfEmpty } from "./studioSampleQueue"
import { StudioRoom } from "./studioRoom"

const ITEM_SHOPS_STUDIO_CONFIG = {
  ...defaultItemShopsConfig,
  enabled: true,
} as const

/**
 * Snapshots from older sessions may carry empty `enabledShopIds` or `assignShopOnJoin: false`,
 * which makes shopping rounds “active” but leaves per-user shop instances empty.
 */
export function enforceStudioItemShopsPluginDefaults(room: StudioRoom): void {
  const stored = room.getPluginConfig(ITEM_SHOPS_PLUGIN_NAME) ?? {}
  const storedIds = Array.isArray(stored.enabledShopIds)
    ? stored.enabledShopIds.filter((id): id is string => typeof id === "string")
    : []
  const knownIds = new Set(SHOP_CATALOG.map((s) => s.shopId))
  const validStored = storedIds.filter((id) => knownIds.has(id))
  const enabledShopIds =
    validStored.length > 0 ? validStored : [...SHOP_CATALOG.map((s) => s.shopId)]

  room.setPluginConfig(ITEM_SHOPS_PLUGIN_NAME, {
    ...defaultItemShopsConfig,
    ...stored,
    enabled: true,
    assignShopOnJoin: true,
    enabledShopIds,
  })
}

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
  room.setPluginConfig(pluginName, { ...ITEM_SHOPS_STUDIO_CONFIG })

  tryHydrateRoom(room)

  const itemShopsPlugin = createItemShopsPlugin({ enabled: true, assignShopOnJoin: true })

  const pluginApi = new MockStudioPluginApi(room, lifecycle, pluginName)
  const gameApi = new MockStudioGameSessionApi(room, lifecycle, pluginName)
  const inventoryApi = new MockStudioInventoryApi(room, registry, pluginName)
  const artifactsApi = new MockStudioArtifactsApi(room)

  registry.register(room.roomId, pluginName, itemShopsPlugin)

  const storage = createMockPluginStorage(room, pluginName, () => room.notify())

  const ctx: PluginContext = {
    roomId: room.roomId,
    api: pluginApi,
    storage,
    lifecycle,
    game: gameApi,
    inventory: inventoryApi,
    artifacts: artifactsApi,
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

  ctx.inventory.registerItemDefinitions(ITEM_CATALOG.map((e) => e.definition))
  enforceStudioItemShopsPluginDefaults(room)
  attachStudioPersistence(room)

  const afterReset = sessionStorage.getItem(STUDIO_SESSION_AFTER_RESET_KEY) === "1"
  if (afterReset) {
    sessionStorage.removeItem(STUDIO_SESSION_AFTER_RESET_KEY)
    room.queue = []
    room.notify()
  } else {
    await seedStudioSampleQueueIfEmpty(room, lifecycle)
  }

  return { room, lifecycle, registry, itemShopsPlugin, itemShopsContext: ctx }
}
