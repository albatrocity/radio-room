import { useCallback, useMemo } from "react"
import type { PluginTabComponent } from "@repo/types"
import { checkShowWhenConditions } from "@repo/utils"
import { usePluginConfigs } from "./useActors"
import { usePluginSchemas } from "./usePluginSchemas"
import { usePluginStoresSelector } from "./usePluginStores"
import type { PluginTabEntry } from "../components/Modals/GameState"

function gameStateTabs(components: { type: string; area?: string }[]): PluginTabComponent[] {
  return components.filter(
    (c): c is PluginTabComponent => c.type === "tab" && c.area === "gameStateTab",
  )
}

/**
 * Plugin-provided game state tabs for the current room (schemas + config + showWhen).
 * `showWhen` sees the plugin's live store as well as its config, so a tab can
 * follow store state (e.g. `tripActive`) without a config round-trip.
 */
export function useGameStatePluginTabEntries(): PluginTabEntry[] {
  const { schemas } = usePluginSchemas()
  const pluginConfigs = usePluginConfigs() || {}

  const storeSpecs = useMemo(
    () =>
      schemas
        .filter((schema) =>
          gameStateTabs(schema.componentSchema?.components ?? []).some((tab) => tab.showWhen),
        )
        .map((schema) => ({
          pluginName: schema.name,
          storeKeys: schema.componentSchema?.storeKeys || [],
        })),
    [schemas],
  )
  // Only the set of visible store-gated tabs re-renders the provider, not
  // every store update (the provider wraps the whole room).
  const selectVisible = useCallback(
    (stores: Record<string, Record<string, unknown>>) => {
      const visible: string[] = []
      for (const schema of schemas) {
        const config = pluginConfigs[schema.name] || schema.defaultConfig || {}
        const store = stores[schema.name] ?? {}
        for (const tab of gameStateTabs(schema.componentSchema?.components ?? [])) {
          if (tab.showWhen && checkShowWhenConditions(tab.showWhen, config, store)) {
            visible.push(`${schema.name}:${tab.id}`)
          }
        }
      }
      return visible.join("\0")
    },
    [schemas, pluginConfigs],
  )
  const visibleKey = usePluginStoresSelector(storeSpecs, selectVisible)

  return useMemo<PluginTabEntry[]>(() => {
    const visible = new Set(visibleKey.split("\0"))
    const result: PluginTabEntry[] = []

    for (const schema of schemas) {
      const components = schema.componentSchema?.components ?? []
      const tabs = gameStateTabs(components)
      if (tabs.length === 0) continue

      const config = pluginConfigs[schema.name] || schema.defaultConfig || {}
      const storeKeys = schema.componentSchema?.storeKeys || []

      for (const tab of tabs) {
        if (tab.showWhen && !visible.has(`${schema.name}:${tab.id}`)) continue
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
  }, [schemas, pluginConfigs, visibleKey])
}
