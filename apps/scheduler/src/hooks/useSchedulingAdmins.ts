import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../lib/queryClient"
import * as api from "../lib/api"

export function useSchedulingAdmins() {
  return useQuery({
    queryKey: queryKeys.schedulingAdmins.list(),
    queryFn: () => api.fetchSchedulingAdmins(),
    staleTime: 10 * 60_000,
  })
}
