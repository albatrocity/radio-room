import { useState, useEffect, useCallback, useRef } from "react"
import { getPluginSchemas } from "../lib/serverApi"
import type { PluginSchemaInfo } from "../types/PluginSchema"

interface UsePluginSchemasResult {
  schemas: PluginSchemaInfo[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

// Global cache for plugin schemas - shared across all hook instances
let cachedSchemas: PluginSchemaInfo[] | null = null
let fetchPromise: Promise<PluginSchemaInfo[]> | null = null

/**
 * Hook to fetch plugin schemas from the server.
 * Returns the list of registered plugins with their config schemas.
 * Uses a global cache to prevent re-fetching on component remounts.
 */
export function usePluginSchemas(): UsePluginSchemasResult {
  const [schemas, setSchemas] = useState<PluginSchemaInfo[]>(cachedSchemas ?? [])
  const [isLoading, setIsLoading] = useState(cachedSchemas === null)
  const [error, setError] = useState<Error | null>(null)
  const mountedRef = useRef(true)

  const fetchSchemas = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // If there's already a fetch in progress, reuse it
      if (!fetchPromise) {
        fetchPromise = getPluginSchemas().then((response) => {
          cachedSchemas = response.plugins
          return response.plugins
        })
      }

      const plugins = await fetchPromise
      if (mountedRef.current) {
        setSchemas(plugins)
      }
    } catch (err) {
      fetchPromise = null // Clear failed promise so we can retry
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error("Failed to fetch plugin schemas"))
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // Only fetch if we don't have cached data
    if (cachedSchemas === null) {
      fetchSchemas()
    }
    return () => {
      mountedRef.current = false
    }
  }, [fetchSchemas])

  const refetch = useCallback(async () => {
    // Force a fresh fetch
    cachedSchemas = null
    fetchPromise = null
    await fetchSchemas()
  }, [fetchSchemas])

  return { schemas, isLoading, error, refetch }
}

