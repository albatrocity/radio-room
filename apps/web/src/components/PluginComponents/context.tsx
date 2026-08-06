import { createContext, useContext } from "react"
import type { PluginComponentState } from "../../types/PluginComponent"

// ============================================================================
// Context
// ============================================================================

export interface PluginComponentContextValue {
  store: PluginComponentState
  config: Record<string, unknown>
  openModal: (modalId: string) => void
  closeModal: (modalId: string) => void
  /** Text color for components in this area */
  textColor?: string
  /** Item-level context for per-item areas (e.g., user data for userListItem) */
  itemContext?: Record<string, unknown>
  /** Owning plugin name (used to dispatch plugin actions from buttons). */
  pluginName?: string
}

export const PluginComponentContext = createContext<PluginComponentContextValue | null>(null)

export function usePluginComponentContext() {
  const ctx = useContext(PluginComponentContext)
  if (!ctx) {
    throw new Error("PluginComponent must be rendered within PluginComponentProvider")
  }
  return ctx
}

/** Room-level modal open/close API (shared across all PluginArea rows). */
export interface PluginModalApi {
  openModal: (pluginName: string, modalId: string) => void
  closeModal: (pluginName: string, modalId: string) => void
  isModalOpen: (pluginName: string, modalId: string) => boolean
}

export const PluginModalApiContext = createContext<PluginModalApi | null>(null)

export function usePluginModalApi(): PluginModalApi {
  const ctx = useContext(PluginModalApiContext)
  if (!ctx) {
    throw new Error("usePluginModalApi must be used within PluginComponentsRoomProvider")
  }
  return ctx
}
