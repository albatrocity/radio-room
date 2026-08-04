import { AppContext } from "@repo/types"

/**
 * Plugin config is split across two Redis keys per room (ADR 0068):
 * - `:config`  — PUBLIC fields, projected to clients via INIT / ROOM_SETTINGS_UPDATED / snapshot.
 * - `:private` — PRIVATE (server-only) fields, never placed on any broadcast surface.
 *
 * Which fields are private is declared in the plugin's config schema
 * (`PluginFieldMeta.scope === "private"`) and resolved at write time from the
 * plugin registry. Runtime reads (via `PluginAPI.getPluginConfig`) merge both.
 */

function configKey(roomId: string, pluginName: string): string {
  return `room:${roomId}:plugins:${pluginName}:config`
}

function privateKey(roomId: string, pluginName: string): string {
  return `room:${roomId}:plugins:${pluginName}:private`
}

/** Index of plugin names with stored config for a room (avoids KEYS on INIT). */
function pluginsIndexKey(roomId: string): string {
  return `room:${roomId}:plugins:index`
}

async function rememberPluginInIndex(
  context: AppContext,
  roomId: string,
  pluginName: string,
): Promise<void> {
  await context.redis.pubClient.sAdd(pluginsIndexKey(roomId), pluginName)
}

async function forgetPluginInIndex(
  context: AppContext,
  roomId: string,
  pluginName: string,
): Promise<void> {
  await context.redis.pubClient.sRem(pluginsIndexKey(roomId), pluginName)
}

async function listPluginNames(context: AppContext, roomId: string): Promise<string[]> {
  const indexed = await context.redis.pubClient.sMembers(pluginsIndexKey(roomId))
  if (indexed.length > 0) return indexed

  // Migration fallback: discover via KEYS once, then seed the index.
  const keys = await context.redis.pubClient.keys(`room:${roomId}:plugins:*:config`)
  const names: string[] = []
  for (const key of keys) {
    const match = key.match(/room:.*:plugins:(.*):config/)
    if (match?.[1]) names.push(match[1])
  }
  if (names.length > 0) {
    for (const name of names) {
      await rememberPluginInIndex(context, roomId, name)
    }
  }
  return names
}

/**
 * Resolve the set of PRIVATE field names for a plugin from its config schema.
 * Returns an empty set when no schema is available (fail-open only in the sense
 * that a plugin declaring no private fields behaves exactly as before). Only
 * fields explicitly marked `scope: "private"` are ever withheld from broadcast.
 */
function getPrivateFieldNames(context: AppContext, pluginName: string): Set<string> {
  const names = new Set<string>()
  try {
    const schema = context.pluginRegistry?.getPluginSchema?.(pluginName)?.configSchema
    const fieldMeta = schema?.fieldMeta as Record<string, { scope?: string }> | undefined
    if (!fieldMeta) return names
    for (const [name, meta] of Object.entries(fieldMeta)) {
      if (meta?.scope === "private") names.add(name)
    }
  } catch (error) {
    console.error(`[PluginConfig] Error resolving private fields for ${pluginName}:`, error)
  }
  return names
}

async function readJson(
  context: AppContext,
  key: string,
): Promise<Record<string, unknown> | null> {
  const raw = await context.redis.pubClient.get(key)
  if (!raw) return null
  return JSON.parse(raw) as Record<string, unknown>
}

/**
 * Get the PUBLIC plugin configuration for a room (the broadcast-safe view).
 * This is the value included in INIT / ROOM_SETTINGS_UPDATED payloads.
 */
export async function getPluginConfig(params: {
  context: AppContext
  roomId: string
  pluginName: string
}): Promise<any | null> {
  const { context, roomId, pluginName } = params
  try {
    return await readJson(context, configKey(roomId, pluginName))
  } catch (error) {
    console.error(`[PluginConfig] Error getting config for ${pluginName} in room ${roomId}:`, error)
    return null
  }
}

/**
 * Get only the PRIVATE (server-only) plugin config fields for a room.
 * Never send this to non-admin clients.
 */
export async function getPluginPrivateConfig(params: {
  context: AppContext
  roomId: string
  pluginName: string
}): Promise<Record<string, unknown> | null> {
  const { context, roomId, pluginName } = params
  try {
    return await readJson(context, privateKey(roomId, pluginName))
  } catch (error) {
    console.error(
      `[PluginConfig] Error getting private config for ${pluginName} in room ${roomId}:`,
      error,
    )
    return null
  }
}

/**
 * Get the MERGED plugin config (public + private) for a room. This is the full
 * config the plugin runtime sees. Used by `PluginAPI.getPluginConfig` and the
 * admin-gated fetch (ADR 0068 §2). Never broadcast this to non-admins.
 */
export async function getMergedPluginConfig(params: {
  context: AppContext
  roomId: string
  pluginName: string
}): Promise<any | null> {
  const { context, roomId, pluginName } = params
  const publicConfig = await getPluginConfig({ context, roomId, pluginName })
  const privateConfig = await getPluginPrivateConfig({ context, roomId, pluginName })
  if (publicConfig == null && privateConfig == null) return null
  return { ...(publicConfig ?? {}), ...(privateConfig ?? {}) }
}

/**
 * Set plugin configuration for a room, routing PRIVATE fields (per the plugin's
 * schema) to the server-only `:private` key and PUBLIC fields to `:config`.
 *
 * Private write is a MERGE: private fields absent from `config` are preserved,
 * so a partial save (e.g. an admin who never fetched the private values) cannot
 * silently blank stored secrets (ADR 0068 §2 "leave unchanged if not fetched").
 */
export async function setPluginConfig(params: {
  context: AppContext
  roomId: string
  pluginName: string
  config: any
}): Promise<void> {
  const { context, roomId, pluginName, config } = params
  const cfgKey = configKey(roomId, pluginName)
  const privKey = privateKey(roomId, pluginName)

  try {
    if (config === null || config === undefined) {
      await context.redis.pubClient.del(cfgKey)
      await context.redis.pubClient.del(privKey)
      await forgetPluginInIndex(context, roomId, pluginName)
      return
    }

    const privateFields = getPrivateFieldNames(context, pluginName)

    if (privateFields.size === 0) {
      // No private fields declared: behaves exactly as before.
      await context.redis.pubClient.set(cfgKey, JSON.stringify(config))
      await rememberPluginInIndex(context, roomId, pluginName)
      return
    }

    const publicConfig: Record<string, unknown> = {}
    const incomingPrivate: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
      if (privateFields.has(key)) {
        incomingPrivate[key] = value
      } else {
        publicConfig[key] = value
      }
    }

    await context.redis.pubClient.set(cfgKey, JSON.stringify(publicConfig))
    await rememberPluginInIndex(context, roomId, pluginName)

    // Merge incoming private fields over existing ones (preserve omitted secrets).
    const existingPrivate = (await getPluginPrivateConfig({ context, roomId, pluginName })) ?? {}
    const mergedPrivate = { ...existingPrivate, ...incomingPrivate }
    if (Object.keys(mergedPrivate).length > 0) {
      await context.redis.pubClient.set(privKey, JSON.stringify(mergedPrivate))
    }
  } catch (error) {
    console.error(`[PluginConfig] Error setting config for ${pluginName} in room ${roomId}:`, error)
    throw error
  }
}

/**
 * Write PRIVATE (server-only) plugin config fields directly to the `:private`
 * key, bypassing schema-based routing. Used by the segment activation fan-out
 * (ADR 0068 §5), where the values are already known to be private content.
 *
 * This is a MERGE (like {@link setPluginConfig}'s private path): fields absent
 * from `config` are preserved. It NEVER touches `:config`, so it cannot leak a
 * value onto a broadcast surface even if the schema is unavailable.
 */
export async function setPluginPrivateConfig(params: {
  context: AppContext
  roomId: string
  pluginName: string
  config: Record<string, unknown>
}): Promise<void> {
  const { context, roomId, pluginName, config } = params
  try {
    const existing = (await getPluginPrivateConfig({ context, roomId, pluginName })) ?? {}
    const merged = { ...existing, ...config }
    if (Object.keys(merged).length === 0) return
    await context.redis.pubClient.set(privateKey(roomId, pluginName), JSON.stringify(merged))
  } catch (error) {
    console.error(
      `[PluginConfig] Error setting private config for ${pluginName} in room ${roomId}:`,
      error,
    )
    throw error
  }
}

/**
 * Delete all plugin configurations (public + private) for a room.
 * Called when a room is deleted.
 */
export async function deleteAllPluginConfigs(params: {
  context: AppContext
  roomId: string
}): Promise<void> {
  const { context, roomId } = params
  try {
    const keys = [
      ...(await context.redis.pubClient.keys(`room:${roomId}:plugins:*:config`)),
      ...(await context.redis.pubClient.keys(`room:${roomId}:plugins:*:private`)),
      pluginsIndexKey(roomId),
    ]
    if (keys.length > 0) {
      await context.redis.pubClient.del(keys)
      console.log(`[PluginConfig] Deleted ${keys.length} plugin config keys for room ${roomId}`)
    }
  } catch (error) {
    console.error(`[PluginConfig] Error deleting plugin configs for room ${roomId}:`, error)
  }
}

/**
 * Get all PUBLIC plugin configurations for a room (broadcast-safe).
 * Used by INIT and ROOM_SETTINGS_UPDATED. Private fields are never included.
 */
export async function getAllPluginConfigs(params: {
  context: AppContext
  roomId: string
}): Promise<Record<string, any>> {
  const { context, roomId } = params

  try {
    const pluginNames = await listPluginNames(context, roomId)
    if (pluginNames.length === 0) return {}

    const keys = pluginNames.map((name) => configKey(roomId, name))
    const values = await context.redis.pubClient.mGet(keys)
    const configs: Record<string, any> = {}

    for (let i = 0; i < pluginNames.length; i++) {
      const raw = values[i]
      if (!raw) continue
      try {
        configs[pluginNames[i]!] = JSON.parse(raw)
      } catch (e) {
        console.error(`[PluginConfig] Error parsing config for ${pluginNames[i]}:`, e)
      }
    }

    return configs
  } catch (error) {
    console.error(`[PluginConfig] Error getting all plugin configs for room ${roomId}:`, error)
    return {}
  }
}

/**
 * Get all MERGED plugin configurations (public + private) for a room.
 *
 * ADMIN-ONLY: this includes server-only private fields (e.g. quiz accepted
 * answers). Only serve it over an admin-gated, per-socket pull (ADR 0068 §2) —
 * never broadcast it to a room. Used to prime the admin editor with existing
 * private values.
 */
export async function getAllMergedPluginConfigs(params: {
  context: AppContext
  roomId: string
}): Promise<Record<string, any>> {
  const { context, roomId } = params

  try {
    const pluginNames = await listPluginNames(context, roomId)
    // Also discover private-only keys that might not be in the public index yet.
    const privateKeys = await context.redis.pubClient.keys(`room:${roomId}:plugins:*:private`)
    const names = new Set(pluginNames)
    for (const key of privateKeys) {
      const match = key.match(/room:.*:plugins:(.*):private/)
      if (match?.[1]) names.add(match[1])
    }

    const configs: Record<string, any> = {}
    for (const pluginName of names) {
      const merged = await getMergedPluginConfig({ context, roomId, pluginName })
      if (merged != null) configs[pluginName] = merged
    }
    return configs
  } catch (error) {
    console.error(
      `[PluginConfig] Error getting all merged plugin configs for room ${roomId}:`,
      error,
    )
    return {}
  }
}
