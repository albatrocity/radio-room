import { useState, useEffect } from "react"
import { getPluginSchemas } from "../lib/serverApi"
import type { PluginSchemaInfo } from "../types/PluginSchema"

interface UsePluginSchemasResult {
  schemas: PluginSchemaInfo[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch plugin schemas from the server.
 * Returns the list of registered plugins with their config schemas.
 */
export function usePluginSchemas(): UsePluginSchemasResult {
  const [schemas, setSchemas] = useState<PluginSchemaInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchSchemas = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await getPluginSchemas()
      setSchemas(response.plugins)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch plugin schemas"))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSchemas()
  }, [])

  return { schemas, isLoading, error, refetch: fetchSchemas }
}

