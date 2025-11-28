import { useState, useEffect, useCallback, useMemo } from "react"
import { useRoomStore } from "../state/roomStore"
import { getPluginComponentStates } from "../lib/serverApi"
import socketService from "../lib/socketService"
import type {
  PluginComponentStores,
  PluginComponentState,
  PluginComponentSchema,
} from "../types/PluginComponent"
import type { PluginSchemaInfo } from "../types/PluginSchema"

interface UsePluginComponentStoreOptions {
  /** Plugin schemas (from usePluginSchemas) */
  schemas: PluginSchemaInfo[]
}

interface UsePluginComponentStoreResult {
  /** All plugin component stores */
  stores: PluginComponentStores
  /** Whether initial state is loading */
  isLoading: boolean
  /** Error if initial fetch failed */
  error: Error | null
  /** Get store for a specific plugin */
  getPluginStore: (pluginName: string) => PluginComponentState
  /** Manually refetch component states */
  refetch: () => Promise<void>
}

/**
 * Hook to manage plugin component stores.
 *
 * - Fetches initial state from server on mount
 * - Subscribes to plugin events and updates stores
 * - Provides store access by plugin name
 *
 * @example
 * ```tsx
 * const { stores, getPluginStore } = usePluginComponentStore({ schemas })
 *
 * // Get store for specific plugin
 * const specialWordsStore = getPluginStore("special-words")
 * const leaderboard = specialWordsStore.usersLeaderboard
 * ```
 */
export function usePluginComponentStore({
  schemas,
}: UsePluginComponentStoreOptions): UsePluginComponentStoreResult {
  const { state: roomState } = useRoomStore()
  const roomId = roomState.context.room?.id

  const [stores, setStores] = useState<PluginComponentStores>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Build a map of pluginName -> storeKeys for quick lookup
  const storeKeysByPlugin = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const schema of schemas) {
      if (schema.componentSchema?.storeKeys) {
        map[schema.name] = schema.componentSchema.storeKeys
      }
    }
    return map
  }, [schemas])

  // Fetch initial state
  const fetchInitialState = useCallback(async () => {
    if (!roomId) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await getPluginComponentStates(roomId)
      setStores(response.states)
    } catch (err) {
      console.error("[usePluginComponentStore] Error fetching initial state:", err)
      setError(err instanceof Error ? err : new Error("Failed to fetch plugin component states"))
    } finally {
      setIsLoading(false)
    }
  }, [roomId])

  // Initial fetch
  useEffect(() => {
    fetchInitialState()
  }, [fetchInitialState])

  // Subscribe to plugin events
  useEffect(() => {
    if (!roomId) return

    // Handler for plugin events
    const handlePluginEvent = (event: { type: string; data: Record<string, unknown> }) => {
      // Extract plugin name from event type: PLUGIN:plugin-name:EVENT_NAME
      const match = event.type.match(/^PLUGIN:([^:]+):/)
      if (!match) return

      const pluginName = match[1]
      const storeKeys = storeKeysByPlugin[pluginName]
      if (!storeKeys || storeKeys.length === 0) return

      // Check if event data contains any store keys
      const updates: Record<string, unknown> = {}
      for (const key of storeKeys) {
        if (key in event.data) {
          updates[key] = event.data[key]
        }
      }

      // Update store if there are matching keys
      if (Object.keys(updates).length > 0) {
        setStores((prev) => ({
          ...prev,
          [pluginName]: {
            ...prev[pluginName],
            ...updates,
          },
        }))
      }
    }

    socketService(handlePluginEvent, (s) => {
      console.log("event", s)
    })
  }, [roomId, storeKeysByPlugin])

  // Get store for a specific plugin
  const getPluginStore = useCallback(
    (pluginName: string): PluginComponentState => {
      return stores[pluginName] || {}
    },
    [stores],
  )

  return {
    stores,
    isLoading,
    error,
    getPluginStore,
    refetch: fetchInitialState,
  }
}
