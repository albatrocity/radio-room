import { pluginFactories } from "@repo/plugins"
import type { PluginFactory, PluginSchemaInfo } from "@repo/types"
import { toPluginSchemaInfo } from "@repo/utils"

/**
 * Plugins whose Room UI the preview simulates. Game Studio only syncs a config for
 * item-shops, so these default to enabled or their `showWhen: enabled` components stay hidden.
 */
const PREVIEW_ENABLED_PLUGINS = new Set([
  "item-shops",
  "quiz-sessions",
  "playlist-bingo",
  "queue-theme",
  "volume-manager",
  "round-robin-dj",
  "music-upload",
  "lyric-hero",
])

/** `GET /api/plugins` from the same factories the API registers. */
export function buildBridgePluginSchemas(
  factories: PluginFactory[] = pluginFactories,
): PluginSchemaInfo[] {
  return factories.map((factory) => {
    const info = toPluginSchemaInfo(factory())
    return PREVIEW_ENABLED_PLUGINS.has(info.name)
      ? { ...info, defaultConfig: { ...info.defaultConfig, enabled: true } }
      : info
  })
}
