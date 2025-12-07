import { AppContext, Plugin } from "@repo/types"
import type { RadioRoomServer } from "../index"

/**
 * Common OAuth placeholder config for adapters that need per-room credentials
 */
export const createOAuthPlaceholder = (clientId: string) => ({
  type: "oauth" as const,
  clientId,
  token: { accessToken: "", refreshToken: "" },
  async getStoredTokens() {
    return { accessToken: "placeholder", refreshToken: "placeholder" }
  },
})

/**
 * Simple no-auth config
 */
export const noAuth = { type: "none" as const }

/**
 * Registration options for different adapter types
 */
export interface AdapterRegistrationConfig {
  serviceAuth?: {
    name: string
    factory: (context: AppContext) => any
  }[]

  playbackControllers?: {
    name: string
    module: { register: (config: any) => Promise<any> }
    authentication: any
  }[]

  metadataSources?: {
    name: string
    module: { register: (config: any) => Promise<any> }
    authentication: any
    url?: string
  }[]

  mediaSources?: {
    name: string
    module: { register: (config: any) => Promise<any> }
    authentication?: any
    url?: string
  }[]

  authRoutes?: {
    path: string
    handler: (context: AppContext) => any
  }[]

  /** Plugin factory functions - each returns a Plugin instance */
  plugins?: (() => Plugin)[]
}

/**
 * Register all adapters from a configuration object
 * Reduces boilerplate by handling the common patterns:
 * - Register adapter
 * - Store module reference
 * - Store registered instance
 */
export async function registerAdapters(
  server: RadioRoomServer,
  config: AdapterRegistrationConfig,
): Promise<void> {
  const context = server.getContext()
  const registerJob = server.registerJob.bind(server)

  // Register service auth adapters
  for (const { name, factory } of config.serviceAuth ?? []) {
    const adapter = factory(context)
    context.adapters.serviceAuth.set(name, adapter)
    console.log(`Registered service auth: ${name}`)
  }

  // Register playback controllers
  for (const { name, module, authentication } of config.playbackControllers ?? []) {
    const instance = await module.register({ name, authentication })
    context.adapters.playbackControllerModules.set(name, module)
    context.adapters.playbackControllers.set(name, instance)
    console.log(`Registered playback controller: ${name}`)
  }

  // Register metadata sources
  for (const { name, module, authentication, url = "" } of config.metadataSources ?? []) {
    try {
      const instance = await module.register({ name, url, authentication, registerJob })
      context.adapters.metadataSourceModules.set(name, module)
      context.adapters.metadataSources.set(name, instance)
      console.log(`Registered metadata source: ${name}`)
    } catch (error) {
      console.error(`Failed to register metadata source ${name}:`, error)
      // Store the module anyway so it can be instantiated per-room later
      context.adapters.metadataSourceModules.set(name, module)
    }
  }

  // Register media sources
  for (const { name, module, authentication = noAuth, url = "" } of config.mediaSources ?? []) {
    const instance = await module.register({ name, url, authentication, registerJob })
    context.adapters.mediaSourceModules.set(name, module)
    context.adapters.mediaSources.set(name, instance)
    console.log(`Registered media source: ${name}`)
  }

  // Mount auth routes
  for (const { path, handler } of config.authRoutes ?? []) {
    try {
      const router = handler(context)
      server.mountRoutes(path, router)
      console.log(`Mounted auth routes: ${path}`)
    } catch (error) {
      console.error(`Failed to mount auth routes at ${path}:`, error)
      // Continue with other auth routes - don't let one failure break others
    }
  }

  // Store plugins to be registered after server.start() initializes the PluginRegistry
  if (config.plugins?.length) {
    server.setPendingPlugins(config.plugins)
    console.log(`Queued ${config.plugins.length} plugin(s) for registration`)
  }
}
