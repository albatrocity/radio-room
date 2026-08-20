import React, { useMemo } from "react"
import { Wrap } from "@chakra-ui/react"
import { checkShowWhenConditions } from "@repo/utils"
import { PluginComponentProvider, PluginComponentRenderer } from "./PluginComponentRenderer"
import { usePluginComponentContext } from "./context"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import { useCurrentUser, useIsAdmin, usePluginConfigs } from "../../hooks/useActors"
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
 * Store/socket state comes from the room-level shared actor per pluginName
 * (see PluginComponentsRoomProvider). Store-gated `showWhen` is evaluated after
 * that store is in context — not during the area candidate scan.
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
  const isAdmin = useIsAdmin()

  const pluginsForArea = useMemo(() => {
    const result: PluginComponents[] = []

    for (const schema of schemas) {
      if (!schema.componentSchema?.components) continue

      const componentsInArea = schema.componentSchema.components.filter((comp) => {
        if (comp.area !== area) return false
        if (comp.type === "modal" || comp.type === "tab") return false
        if (
          (comp.type === "button" || comp.type === "slider") &&
          "adminOnly" in comp &&
          comp.adminOnly &&
          !isAdmin
        ) {
          return false
        }
        return true
      })

      if (componentsInArea.length === 0) continue

      result.push({
        pluginName: schema.name,
        config: pluginConfigs[schema.name] || schema.defaultConfig || {},
        storeKeys: schema.componentSchema.storeKeys || [],
        components: componentsInArea,
      })
    }

    return result
  }, [schemas, area, pluginConfigs, isAdmin])

  if (isLoading || pluginsForArea.length === 0) {
    return null
  }

  return (
    <Wrap
      direction={direction}
      gap={spacing}
      color={color}
      width="100%"
      align={direction === "row" ? "center" : "stretch"}
      css={{ "&:not(:has([data-plugin-component-id]))": { display: "none" } }}
    >
      {pluginsForArea.map((plugin) => (
        <PluginComponentProvider
          key={plugin.pluginName}
          pluginName={plugin.pluginName}
          storeKeys={plugin.storeKeys}
          config={plugin.config}
          textColor={color}
          itemContext={itemContext}
        >
          <VisiblePluginComponents components={plugin.components} />
        </PluginComponentProvider>
      ))}
    </Wrap>
  )
}

function VisiblePluginComponents({
  components,
}: {
  components: PluginComponentDefinition[]
}) {
  const { config, store, itemContext } = usePluginComponentContext()
  const isAdmin = useIsAdmin()
  const currentUser = useCurrentUser()
  const viewerContext = useMemo(
    () => ({
      userId: currentUser?.userId,
      isAdmin,
    }),
    [currentUser?.userId, isAdmin],
  )

  const visibleComponents = useMemo(
    () =>
      components.filter(
        (comp) =>
          !comp.showWhen ||
          checkShowWhenConditions(comp.showWhen, config, store, itemContext, viewerContext),
      ),
    [components, config, store, itemContext, viewerContext],
  )

  if (visibleComponents.length === 0) return null

  return (
    <>
      {visibleComponents.map((comp) => (
        <PluginComponentRenderer key={comp.id} component={comp} />
      ))}
    </>
  )
}
