import React from "react"
import { Box, HStack, VStack } from "@chakra-ui/react"
import { usePluginComponents, PluginComponentWithMeta } from "./PluginComponentsContext"
import { PluginComponentProvider, PluginComponentRenderer } from "./PluginComponentRenderer"
import type { PluginComponentArea } from "../../types/PluginComponent"

interface PluginAreaProps {
  /** The area to render components for */
  area: PluginComponentArea
  /** Layout direction */
  direction?: "row" | "column"
  /** For item-level areas, the ID of the item */
  itemId?: string
  /** Spacing between components */
  spacing?: number
}

/**
 * Renders all plugin components for a specific area.
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
}: PluginAreaProps) {
  const { getComponentsForArea, isLoading } = usePluginComponents()

  if (isLoading) {
    return null
  }

  const components = getComponentsForArea(area)

  if (components.length === 0) {
    return null
  }

  // Group components by plugin for proper context provision
  const componentsByPlugin = new Map<string, PluginComponentWithMeta[]>()
  for (const comp of components) {
    const existing = componentsByPlugin.get(comp.pluginName) || []
    existing.push(comp)
    componentsByPlugin.set(comp.pluginName, existing)
  }

  const Container = direction === "row" ? HStack : VStack

  return (
    <Container spacing={spacing}>
      {Array.from(componentsByPlugin.entries()).map(([pluginName, pluginComponents]) => {
        // Get first component to access store/config (they're the same for all components of a plugin)
        const first = pluginComponents[0]
        const allPluginDefs = pluginComponents.map((c) => c.component)

        return (
          <PluginComponentProvider
            key={pluginName}
            store={first.store}
            config={first.config}
            components={allPluginDefs}
          >
            {pluginComponents
              .filter((c) => c.component.type !== "modal")
              .map((comp) => (
                <PluginComponentRenderer key={comp.component.id} component={comp.component} />
              ))}
          </PluginComponentProvider>
        )
      })}
    </Container>
  )
}

