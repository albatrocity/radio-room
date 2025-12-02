import { useMemo } from "react"

/**
 * Hook to extract and merge plugin style hints from pluginData
 * @param pluginData - Plugin data from a queue item or now playing track
 * @param element - The UI element to get styles for
 * @returns Merged CSS properties from all plugins
 */
export function usePluginStyles(
  pluginData: Record<string, any> | undefined,
  element: "title" | "subtitle" | "badge",
): React.CSSProperties {
  return useMemo(() => {
    if (!pluginData) return {}

    const allStyles: React.CSSProperties = {}

    // Iterate through all plugins and merge their style hints
    for (const pluginName in pluginData) {
      const data = pluginData[pluginName]
      if (data?.styles?.[element]) {
        Object.assign(allStyles, data.styles[element])
      }
    }

    return allStyles
  }, [pluginData, element])
}

