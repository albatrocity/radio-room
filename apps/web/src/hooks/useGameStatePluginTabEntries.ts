import { useMemo } from "react"
import type { PluginTabComponent } from "@repo/types"
import { checkShowWhenConditions } from "@repo/utils"
import { usePluginConfigs } from "./useActors"
import { usePluginSchemas } from "./usePluginSchemas"
import type { PluginTabEntry } from "../components/Modals/GameState"

/**
 * Plugin-provided game state tabs for the current room (schemas + config + showWhen).
 */
export function useGameStatePluginTabEntries(): PluginTabEntry[] {
  const { schemas } = usePluginSchemas()
  const pluginConfigs = usePluginConfigs() || {}

  return useMemo<PluginTabEntry[]>(() => {
    const result: PluginTabEntry[] = []

    for (const schema of schemas) {
      const components = schema.componentSchema?.components ?? []
      const tabs = components.filter(
        (c): c is PluginTabComponent => c.type === "tab" && c.area === "gameStateTab",
      )
      if (tabs.length === 0) continue

      const config = pluginConfigs[schema.name] || schema.defaultConfig || {}
      const storeKeys = schema.componentSchema?.storeKeys || []

      for (const tab of tabs) {
        if (tab.showWhen && !checkShowWhenConditions(tab.showWhen, config, {})) {
          continue
        }
        result.push({
          id: `${schema.name}:${tab.id}`,
          pluginName: schema.name,
          label: tab.label,
          icon: tab.icon,
          config,
          storeKeys,
          components,
          tab,
        })
      }
    }
    return result
  }, [schemas, pluginConfigs])
}
