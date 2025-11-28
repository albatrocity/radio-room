import React, { createContext, useContext, useMemo, useCallback } from "react"
import { useMachine } from "@xstate/react"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import { usePluginComponentStore } from "../../hooks/usePluginComponentStore"
import { settingsMachine } from "../../machines/settingsMachine"
import type { PluginSchemaInfo } from "../../types/PluginSchema"
import type {
  PluginComponentStores,
  PluginComponentState,
  PluginComponentDefinition,
  PluginComponentArea,
} from "../../types/PluginComponent"

// ============================================================================
// Context Types
// ============================================================================

interface PluginComponentsContextValue {
  /** All plugin schemas */
  schemas: PluginSchemaInfo[]
  /** All component stores by plugin name */
  stores: PluginComponentStores
  /** Whether schemas or stores are still loading */
  isLoading: boolean
  /** Any error during loading */
  error: Error | null
  /** Get components for a specific area */
  getComponentsForArea: (area: PluginComponentArea) => PluginComponentWithMeta[]
  /** Get store for a specific plugin */
  getPluginStore: (pluginName: string) => PluginComponentState
  /** Get config for a specific plugin (from room settings) */
  getPluginConfig: (pluginName: string) => Record<string, unknown>
}

export interface PluginComponentWithMeta {
  component: PluginComponentDefinition
  pluginName: string
  store: PluginComponentState
  config: Record<string, unknown>
}

const PluginComponentsContext = createContext<PluginComponentsContextValue | null>(null)

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access plugin components context.
 * Must be used within PluginComponentsProvider.
 */
export function usePluginComponents() {
  const ctx = useContext(PluginComponentsContext)
  if (!ctx) {
    throw new Error("usePluginComponents must be used within PluginComponentsProvider")
  }
  return ctx
}

/**
 * Safe version of usePluginComponents that returns null if not in provider.
 * Useful for optional plugin component rendering.
 */
export function usePluginComponentsSafe() {
  return useContext(PluginComponentsContext)
}

// ============================================================================
// Provider
// ============================================================================

interface PluginComponentsProviderProps {
  children: React.ReactNode
}

/**
 * Provides plugin component schemas and stores to the component tree.
 * Should be placed high in the component tree (e.g., in Room.tsx).
 *
 * Automatically retrieves plugin configs from the settingsMachine.
 */
export function PluginComponentsProvider({ children }: PluginComponentsProviderProps) {
  const { schemas, isLoading: schemasLoading, error: schemasError } = usePluginSchemas()
  const [settingsState] = useMachine(settingsMachine)
  const pluginConfigs = settingsState.context.pluginConfigs || {}

  const {
    stores,
    isLoading: storesLoading,
    error: storesError,
    getPluginStore,
  } = usePluginComponentStore({ schemas })

  const isLoading = schemasLoading || storesLoading
  const error = schemasError || storesError

  // Build a flat list of all components with their metadata
  const allComponents = useMemo(() => {
    const result: PluginComponentWithMeta[] = []

    for (const schema of schemas) {
      if (!schema.componentSchema?.components) continue

      const store = stores[schema.name] || {}
      const config = pluginConfigs[schema.name] || schema.defaultConfig || {}

      for (const component of schema.componentSchema.components) {
        result.push({
          component,
          pluginName: schema.name,
          store,
          config,
        })
      }
    }

    return result
  }, [schemas, stores, pluginConfigs])

  // Get components for a specific area
  const getComponentsForArea = useCallback(
    (area: PluginComponentArea): PluginComponentWithMeta[] => {
      return allComponents.filter((c) => c.component.area === area)
    },
    [allComponents],
  )

  // Get config for a specific plugin
  const getPluginConfig = useCallback(
    (pluginName: string): Record<string, unknown> => {
      return pluginConfigs[pluginName] || {}
    },
    [pluginConfigs],
  )

  const value: PluginComponentsContextValue = {
    schemas,
    stores,
    isLoading,
    error,
    getComponentsForArea,
    getPluginStore,
    getPluginConfig,
  }

  return (
    <PluginComponentsContext.Provider value={value}>
      {children}
    </PluginComponentsContext.Provider>
  )
}

