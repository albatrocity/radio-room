import { AppContext } from "@repo/types"

/**
 * Get plugin configuration for a room
 */
export async function getPluginConfig(params: {
  context: AppContext
  roomId: string
  pluginName: string
}): Promise<any | null> {
  const { context, roomId, pluginName } = params
  const key = `room:${roomId}:plugins:${pluginName}:config`

  try {
    const configString = await context.redis.pubClient.get(key)
    if (!configString) {
      return null
    }
    return JSON.parse(configString)
  } catch (error) {
    console.error(`[PluginConfig] Error getting config for ${pluginName} in room ${roomId}:`, error)
    return null
  }
}

/**
 * Set plugin configuration for a room
 */
export async function setPluginConfig(params: {
  context: AppContext
  roomId: string
  pluginName: string
  config: any
}): Promise<void> {
  const { context, roomId, pluginName, config } = params
  const key = `room:${roomId}:plugins:${pluginName}:config`

  try {
    if (config === null || config === undefined) {
      // Delete the config if null/undefined
      await context.redis.pubClient.del(key)
    } else {
      await context.redis.pubClient.set(key, JSON.stringify(config))
    }
  } catch (error) {
    console.error(`[PluginConfig] Error setting config for ${pluginName} in room ${roomId}:`, error)
    throw error
  }
}

/**
 * Delete all plugin configurations for a room
 * Called when a room is deleted
 */
export async function deleteAllPluginConfigs(params: {
  context: AppContext
  roomId: string
}): Promise<void> {
  const { context, roomId } = params
  const pattern = `room:${roomId}:plugins:*:config`

  try {
    const keys = await context.redis.pubClient.keys(pattern)
    if (keys.length > 0) {
      await context.redis.pubClient.del(keys)
      console.log(`[PluginConfig] Deleted ${keys.length} plugin configs for room ${roomId}`)
    }
  } catch (error) {
    console.error(`[PluginConfig] Error deleting plugin configs for room ${roomId}:`, error)
  }
}

/**
 * Get all plugin configurations for a room
 * Useful for debugging or admin interfaces
 */
export async function getAllPluginConfigs(params: {
  context: AppContext
  roomId: string
}): Promise<Record<string, any>> {
  const { context, roomId } = params
  const pattern = `room:${roomId}:plugins:*:config`

  try {
    const keys = await context.redis.pubClient.keys(pattern)
    const configs: Record<string, any> = {}

    for (const key of keys) {
      const match = key.match(/room:.*:plugins:(.*):config/)
      if (match) {
        const pluginName = match[1]
        const configString = await context.redis.pubClient.get(key)
        if (configString) {
          configs[pluginName] = JSON.parse(configString)
        }
      }
    }

    return configs
  } catch (error) {
    console.error(`[PluginConfig] Error getting all plugin configs for room ${roomId}:`, error)
    return {}
  }
}

