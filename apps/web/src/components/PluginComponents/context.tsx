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
}

export const PluginComponentContext = createContext<PluginComponentContextValue | null>(null)

export function usePluginComponentContext() {
  const ctx = useContext(PluginComponentContext)
  if (!ctx) {
    throw new Error("PluginComponent must be rendered within PluginComponentProvider")
  }
  return ctx
}
