import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../lib/queryClient"
import * as api from "../lib/api"
import type { ShowFilters, CreateShowRequest, UpdateShowRequest } from "@repo/types"
import { toaster } from "../components/ui/toaster"

export function useShows(filters: ShowFilters = {}) {
  return useQuery({
    queryKey: queryKeys.shows.list(filters),
    queryFn: () => api.fetchShows(filters),
  })
}

export function useShow(id: string) {
  return useQuery({
    queryKey: queryKeys.shows.detail(id),
    queryFn: () => api.fetchShow(id),
    enabled: !!id,
  })
}

export function useCreateShow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateShowRequest) => api.createShow(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all })
      toaster.create({ title: "Show created", type: "success" })
    },
    onError: () => {
      toaster.create({ title: "Failed to create show", type: "error" })
    },
  })
}

export function useUpdateShow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateShowRequest & { id: string }) => api.updateShow(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(variables.id) })
    },
    onError: () => {
      toaster.create({ title: "Failed to update show", type: "error" })
    },
  })
}

export function useDeleteShow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteShow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all })
      toaster.create({ title: "Show deleted", type: "success" })
    },
    onError: () => {
      toaster.create({ title: "Failed to delete show", type: "error" })
    },
  })
}

export function useReorderShowSegments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ showId, segmentIds }: { showId: string; segmentIds: string[] }) =>
      api.reorderShowSegments(showId, segmentIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(variables.showId) })
    },
    onError: () => {
      toaster.create({ title: "Failed to reorder segments", type: "error" })
    },
  })
}
