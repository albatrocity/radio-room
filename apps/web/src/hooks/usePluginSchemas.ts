import { useCallback, useEffect, useSyncExternalStore } from "react"
import { getPluginSchemas } from "../lib/serverApi"
import type { PluginSchemaInfo } from "@repo/types/Plugin"

interface UsePluginSchemasResult {
  schemas: PluginSchemaInfo[]
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

type SchemaCacheState = {
  schemas: PluginSchemaInfo[] | null
  error: Error | null
  isFetching: boolean
}

// Module-level cache shared by every hook instance; a refetch updates all of them.
let state: SchemaCacheState = { schemas: null, error: null, isFetching: false }
let fetchPromise: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(next: Partial<SchemaCacheState>): void {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): SchemaCacheState {
  return state
}

function fetchSchemas(): Promise<void> {
  if (fetchPromise) return fetchPromise
  setState({ isFetching: true, error: null })
  fetchPromise = getPluginSchemas()
    .then((response) => {
      setState({ schemas: response.plugins, isFetching: false })
    })
    .catch((err) => {
      setState({
        error: err instanceof Error ? err : new Error("Failed to fetch plugin schemas"),
        isFetching: false,
      })
    })
    .finally(() => {
      fetchPromise = null
    })
  return fetchPromise
}

/**
 * Hook to fetch plugin schemas from the server.
 * Returns the list of registered plugins with their config schemas.
 * Fetched once per page load; `refetch` replaces the list for every hook instance.
 */
export function usePluginSchemas(): UsePluginSchemasResult {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  useEffect(() => {
    if (state.schemas === null && !state.isFetching) {
      void fetchSchemas()
    }
  }, [])

  const refetch = useCallback(() => fetchSchemas(), [])

  return {
    schemas: snapshot.schemas ?? EMPTY,
    isLoading: snapshot.schemas === null && snapshot.error === null,
    error: snapshot.error,
    refetch,
  }
}

const EMPTY: PluginSchemaInfo[] = []
