import { getQuickAccessSchema } from "@repo/plugin-config-ui/logic"
import type { PluginSchemaInfo } from "@repo/types/Plugin"

/**
 * Plugins that appear in the Quick Access menu: declare resolvable `quickAccess`
 * actions and have `enabled: true` in room config.
 */
export function listEnabledQuickAccessPlugins(
  schemas: PluginSchemaInfo[],
  pluginConfigs: Record<string, Record<string, unknown> | undefined> | null | undefined,
): PluginSchemaInfo[] {
  return schemas.filter((plugin) => {
    const schema = plugin.configSchema
    if (!schema?.quickAccess?.length) return false
    if (!getQuickAccessSchema(schema)) return false
    return pluginConfigs?.[plugin.name]?.enabled === true
  })
}
