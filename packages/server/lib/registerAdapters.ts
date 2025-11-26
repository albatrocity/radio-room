import { AppContext } from "@repo/types"
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
    create: (context: AppContext) => any
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
    create: (context: AppContext) => any
  }[]
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
  for (const { name, create } of config.serviceAuth ?? []) {
    const adapter = create(context)
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
    const instance = await module.register({ name, url, authentication, registerJob })
    context.adapters.metadataSourceModules.set(name, module)
    context.adapters.metadataSources.set(name, instance)
    console.log(`Registered metadata source: ${name}`)
  }

  // Register media sources
  for (const { name, module, authentication = noAuth, url = "" } of config.mediaSources ?? []) {
    const instance = await module.register({ name, url, authentication, registerJob })
    context.adapters.mediaSourceModules.set(name, module)
    context.adapters.mediaSources.set(name, instance)
    console.log(`Registered media source: ${name}`)
  }

  // Mount auth routes
  for (const { path, create } of config.authRoutes ?? []) {
    const router = create(context)
    server.mountRoutes(path, router)
    console.log(`Mounted auth routes: ${path}`)
  }
}

