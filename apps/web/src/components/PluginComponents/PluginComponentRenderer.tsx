import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useMachine } from "@xstate/react"
import {
  DialogRoot,
  DialogBackdrop,
  DialogPositioner,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogCloseTrigger,
  CloseButton,
  VStack,
} from "@chakra-ui/react"
import {
  interpolateTemplate,
  interpolatePropsRecursively,
  checkShowWhenCondition,
} from "@repo/utils"
import { pluginComponentMachine } from "../../machines/pluginComponentMachine"
import { useCurrentRoom } from "../../hooks/useActors"
import { PluginComponentContext } from "./context"
import { TEMPLATE_COMPONENT_MAP } from "./templates"
import type { PluginComponentDefinition, PluginModalComponent } from "../../types/PluginComponent"

/**
 * Renders a single plugin component by delegating to its template component.
 * Plugin components are just template components + placement metadata.
 */
function renderPluginComponent(
  component: PluginComponentDefinition,
  config: Record<string, unknown>,
) {
  // Modals are rendered by the provider, not inline
  if (component.type === "modal") {
    return null
  }

  const TemplateComponent = TEMPLATE_COMPONENT_MAP[component.type] as React.ComponentType<any>

  if (!TemplateComponent) {
    console.warn(`[PluginComponent] Unknown component type: ${component.type}`)
    return null
  }

  // Extract only the template component props (exclude metadata)
  const { id, area, showWhen, type, ...templateProps } = component

  // Interpolate config values in props using shared utility
  const interpolatedProps = interpolatePropsRecursively(templateProps, config)

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
 */
export function PluginComponentRenderer({ component }: PluginComponentRendererProps) {
  const { config, store } = React.useContext(PluginComponentContext)!

  // Check showWhen condition
  if (component.showWhen) {
    const conditions = Array.isArray(component.showWhen) ? component.showWhen : [component.showWhen]

    // All conditions must be true (AND logic)
    const allConditionsMet = conditions.every((condition) =>
      checkShowWhenCondition(condition, config, store),
    )

    if (!allConditionsMet) {
      return null
    }
  }

  return renderPluginComponent(component, config)
}

// ============================================================================
// Provider & Modal Manager
// ============================================================================

interface PluginComponentProviderProps {
  children: React.ReactNode
  pluginName: string
  storeKeys: string[]
  config: Record<string, unknown>
  components: PluginComponentDefinition[]
  /** Text color for components */
  textColor?: string
}

/**
 * Provides context for plugin components and manages modals.
 * Owns an XState machine instance for managing component state.
 */
export function PluginComponentProvider({
  children,
  pluginName,
  storeKeys,
  config,
  components,
  textColor,
}: PluginComponentProviderProps) {
  const room = useCurrentRoom()
  const roomId = room?.id
  const [openModals, setOpenModals] = useState<Set<string>>(new Set())

  // Create machine instance for this plugin
  const [state, send] = useMachine(pluginComponentMachine, {
    input: {
      pluginName,
      storeKeys,
    },
  })

  // Update machine context when roomId changes
  useEffect(() => {
    if (!roomId) return
    send({ type: "SET_ROOM_ID", roomId })
  }, [roomId, send])

  // Memoize callbacks to prevent context value changes
  const openModal = useCallback((modalId: string) => {
    setOpenModals((prev) => new Set([...prev, modalId]))
  }, [])

  const closeModal = useCallback((modalId: string) => {
    setOpenModals((prev) => {
      const next = new Set(prev)
      next.delete(modalId)
      return next
    })
  }, [])

  // Find all modal components
  const modalComponents = useMemo(
    () => components.filter((c): c is PluginModalComponent => c.type === "modal"),
    [components],
  )

  // Use store from machine state
  const store = state.context.store

  // Memoize context value - callbacks are now stable
  const contextValue = useMemo(
    () => ({ store, config, openModal, closeModal, textColor }),
    [store, config, openModal, closeModal, textColor],
  )

  return (
    <PluginComponentContext.Provider value={contextValue}>
      {children}

      {/* Render modal components */}
      {modalComponents.map((modal) => {
        const interpolatedTitle = interpolateTemplate(modal.title, { config })

        return (
          <DialogRoot
            key={modal.id}
            open={openModals.has(modal.id)}
            onOpenChange={(e) => !e.open && closeModal(modal.id)}
            size={modal.size || "md"}
            placement="center"
          >
            <DialogBackdrop />
            <DialogPositioner>
              <DialogContent>
                <DialogHeader>{interpolatedTitle}</DialogHeader>
                <DialogCloseTrigger asChild position="absolute" top="2" right="2">
                  <CloseButton size="sm" />
                </DialogCloseTrigger>
                <DialogBody pb={6}>
                  <VStack align="stretch" gap={4}>
                    {modal.children.map((child) => (
                      <PluginComponentRenderer key={child.id} component={child} />
                    ))}
                  </VStack>
                </DialogBody>
              </DialogContent>
            </DialogPositioner>
          </DialogRoot>
        )
      })}
    </PluginComponentContext.Provider>
  )
}

// Re-export for convenience
export { TEMPLATE_COMPONENT_MAP, renderTemplateComponent } from "./templates"
export { usePluginComponentContext } from "./context"
