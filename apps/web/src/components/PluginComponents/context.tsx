import { createContext, useContext, useMemo } from "react"
import { getCurrentUser, getIsAdmin } from "../../actors/authActor"
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

/**
 * Who is looking at the plugin components, resolved once per room rather than
 * per area and per component. `showWhen` conditions and `adminOnly` gating read
 * this instead of subscribing to the auth actor from every playlist and
 * listener row.
 */
// A type alias (not an interface) so it satisfies the `Record<string, unknown>`
// that `checkShowWhenConditions` takes for `viewer.*` lookups.
export type PluginViewerContextValue = {
  userId?: string
  isAdmin: boolean
}

export const PluginViewerContext = createContext<PluginViewerContextValue | null>(null)

export function usePluginViewer(): PluginViewerContextValue {
  const ctx = useContext(PluginViewerContext)
  // Rendering plugin components outside a room is not a supported path today;
  // degrade to a non-reactive read rather than throwing mid-render.
  const fallback = useMemo(() => ({ userId: getCurrentUser()?.userId, isAdmin: getIsAdmin() }), [])
  return ctx ?? fallback
}

/** Resolved `pluginName → config` for the room, shared by every `PluginArea`. */
export const PluginConfigsContext = createContext<Record<string, Record<string, unknown>>>({})

export function usePluginAreaConfigs(): Record<string, Record<string, unknown>> {
  return useContext(PluginConfigsContext)
}
