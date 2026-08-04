import React, { useMemo, useCallback } from "react"
import { useSelector } from "@xstate/react"
import { Box } from "@chakra-ui/react"
import {
  checkShowWhenConditions,
  interpolatePropsRecursively,
} from "@repo/utils"
import { useCurrentUser, useIsAdmin } from "../../hooks/useActors"
import {
  ensurePluginComponentActor,
  getPluginComponentActor,
} from "../../actors/pluginComponentRegistry"
import { PluginComponentContext, usePluginModalApi } from "./context"
import { TEMPLATE_COMPONENT_MAP } from "./templates"
import type { PluginComponentDefinition } from "../../types/PluginComponent"

/**
 * Renders a single plugin component by delegating to its template component.
 * Plugin components are just template components + placement metadata.
 */
function renderPluginComponent(
  component: PluginComponentDefinition,
  config: Record<string, unknown>,
  store: Record<string, unknown>,
  pluginName?: string,
) {
  // Modals are rendered by the room provider, not inline
  if (component.type === "modal") {
    return null
  }

  // Tabs are rendered by the game state modal, not inline
  if (component.type === "tab") {
    return null
  }

  const TemplateComponent = TEMPLATE_COMPONENT_MAP[component.type] as React.ComponentType<any>

  if (!TemplateComponent) {
    console.warn(`[PluginComponent] Unknown component type: ${component.type}`)
    return null
  }

  // Extract only the template component props (exclude metadata)
  const { id, area, showWhen, type, ...templateProps } = component

  // Buttons can reference store keys (e.g. "{{sellPrice}}"), so we expose
  // store values alongside config values when interpolating their props.
  const interpolationContext = { ...store, config }

  // Interpolate config + store values in props using shared utility
  const interpolatedProps = interpolatePropsRecursively(templateProps, interpolationContext)

  // Buttons and sliders need to know which plugin owns them so they can dispatch actions.
  if ((type === "button" || type === "slider") && pluginName) {
    return <TemplateComponent {...interpolatedProps} pluginName={pluginName} />
  }

  return <TemplateComponent {...interpolatedProps} />
}

// ============================================================================
// Component Renderer
// ============================================================================

interface PluginComponentRendererProps {
  component: PluginComponentDefinition
}

/**
 * Renders a single plugin component.
 * Checks showWhen conditions and delegates to the appropriate template component.
 * Wraps the component with data attributes for screen effect targeting.
 */
export function PluginComponentRenderer({ component }: PluginComponentRendererProps) {
  const { config, store, itemContext, pluginName } = React.useContext(PluginComponentContext)!
  const isAdmin = useIsAdmin()
  const currentUser = useCurrentUser()
  const viewerContext = useMemo(
    () => ({
      userId: currentUser?.userId,
      isAdmin,
    }),
    [currentUser?.userId, isAdmin],
  )

  // Hide adminOnly buttons and sliders from non-admins
  if (
    (component.type === "button" || component.type === "slider") &&
    "adminOnly" in component &&
    component.adminOnly &&
    !isAdmin
  ) {
    return null
  }

  if (
    component.showWhen &&
    !checkShowWhenConditions(component.showWhen, config, store, itemContext, viewerContext)
  ) {
    return null
  }

  // Wrap the component with data attributes for screen effect targeting
  // Note: We use display="inline-block" instead of "contents" because
  // CSS animations require an element that generates a box.
  const blockLayout =
    component.type === "shop-offer-table" ||
    component.type === "current-shop-offers" ||
    component.type === "quiz-question-card" ||
    component.type === "slider" ||
    (component.type === "text-block" && "status" in component && !!component.status)

  return (
    <Box
      data-screen-effect-target="plugin"
      data-plugin-component-id={component.id}
      display={blockLayout ? "block" : "inline-block"}
      width={blockLayout ? "full" : undefined}
      flexBasis={blockLayout ? "100%" : undefined}
    >
      {renderPluginComponent(component, config, store, pluginName)}
    </Box>
  )
}

// ============================================================================
// Lightweight scope (shared actor store + per-row itemContext)
// ============================================================================

interface PluginComponentProviderProps {
  children: React.ReactNode
  pluginName: string
  storeKeys: string[]
  config: Record<string, unknown>
  /** Text color for components */
  textColor?: string
  /** Item-level context for per-item areas */
  itemContext?: Record<string, unknown>
}

/**
 * Provides plugin component context for an area/row.
 * Reads store from the room-level shared actor (no per-row machine).
 */
export function PluginComponentProvider({
  children,
  pluginName,
  storeKeys,
  config,
  textColor,
  itemContext,
}: PluginComponentProviderProps) {
  // Ensure actor exists even if room provider hasn't mounted schemas yet
  ensurePluginComponentActor(pluginName, storeKeys)
  const actor = getPluginComponentActor(pluginName)!
  const store = useSelector(actor, (s) => s.context.store)
  const { openModal: openPluginModal, closeModal: closePluginModal } = usePluginModalApi()

  const openModal = useCallback(
    (modalId: string) => openPluginModal(pluginName, modalId),
    [openPluginModal, pluginName],
  )

  const closeModal = useCallback(
    (modalId: string) => closePluginModal(pluginName, modalId),
    [closePluginModal, pluginName],
  )

  const contextValue = useMemo(
    () => ({ store, config, openModal, closeModal, textColor, itemContext, pluginName }),
    [store, config, openModal, closeModal, textColor, itemContext, pluginName],
  )

  return (
    <PluginComponentContext.Provider value={contextValue}>{children}</PluginComponentContext.Provider>
  )
}

// Re-export for convenience
export { TEMPLATE_COMPONENT_MAP, renderTemplateComponent } from "./templates"
export { usePluginComponentContext } from "./context"
