import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../lib/queryClient"
import * as api from "../lib/api"

/**
 * Fetch the plugin schema catalog (`GET /api/plugins`) for segment plugin-config
 * authoring. Schemas are static field definitions, so they are cached for the
 * session and never refetched on window focus.
 */
export function usePluginSchemas() {
  return useQuery({
    queryKey: queryKeys.pluginSchemas.all,
    queryFn: () => api.fetchPluginSchemas(),
    staleTime: Infinity,
  })
}
