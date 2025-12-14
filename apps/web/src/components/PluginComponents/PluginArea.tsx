import React, { useMemo } from "react"
import { Stack } from "@chakra-ui/react"
import { PluginComponentProvider, PluginComponentRenderer } from "./PluginComponentRenderer"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import { usePluginConfigs } from "../../hooks/useActors"
import type { PluginComponentArea, PluginComponentDefinition } from "../../types/PluginComponent"

interface PluginAreaProps {
  /** The area to render components for */
  area: PluginComponentArea
  /** Layout direction */
  direction?: "row" | "column"
  /** For item-level areas, the ID of the item */
  itemId?: string
  /** Spacing between components */
  spacing?: number
  /** Text color for components in this area */
  color?: string
  /** Item-level context for per-item areas (e.g., user data for userListItem) */
  itemContext?: Record<string, unknown>
}

interface PluginComponents {
  pluginName: string
  config: Record<string, unknown>
  storeKeys: string[]
  components: PluginComponentDefinition[]
}

/**
 * Renders all plugin components for a specific area.
 * Each plugin gets its own PluginComponentProvider with an independent XState machine.
 *
 * @example
 * ```tsx
 * // In UserList.tsx
 * <PluginArea area="userList" direction="row" />
 *
 * // In PlaylistItem.tsx
 * <PluginArea area="playlistItem" itemId={track.id} />
 * ```
 */
export function PluginArea({
  area,
  direction = "row",
  itemId,
  spacing = 2,
  color,
  itemContext,
}: PluginAreaProps) {
  const { schemas, isLoading } = usePluginSchemas()
  const pluginConfigs = usePluginConfigs() || {}

  // Build list of plugins with components for this area
  const pluginsForArea = useMemo(() => {
    const result: PluginComponents[] = []

    for (const schema of schemas) {
      if (!schema.componentSchema?.components) continue

      // Filter to components for this area
      const componentsInArea = schema.componentSchema.components.filter(
        (comp) => comp.area === area,
      )

      if (componentsInArea.length === 0) continue

      const config = pluginConfigs[schema.name] || schema.defaultConfig || {}
      const storeKeys = schema.componentSchema.storeKeys || []

      result.push({
        pluginName: schema.name,
        config,
        storeKeys,
        components: componentsInArea,
      })
    }

    return result
  }, [schemas, area, pluginConfigs])

  if (isLoading || pluginsForArea.length === 0) {
    return null
  }

  return (
    <Stack direction={direction} gap={spacing} color={color}>
      {pluginsForArea.map(({ pluginName, config, storeKeys, components }) => (
        <PluginComponentProvider
          key={pluginName}
          pluginName={pluginName}
          storeKeys={storeKeys}
          config={config}
          components={components}
          textColor={color}
          itemContext={itemContext}
        >
          {components
            .filter((c) => c.type !== "modal")
            .map((comp) => (
              <PluginComponentRenderer key={comp.id} component={comp} />
            ))}
        </PluginComponentProvider>
      ))}
    </Stack>
  )
}
