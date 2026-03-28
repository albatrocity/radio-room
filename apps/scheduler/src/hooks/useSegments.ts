import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../lib/queryClient"
import * as api from "../lib/api"
import type { SegmentFilters, CreateSegmentRequest, UpdateSegmentRequest } from "@repo/types"
import { toaster } from "../components/ui/toaster"

export function useSegments(filters: SegmentFilters = {}) {
  return useQuery({
    queryKey: queryKeys.segments.list(filters),
    queryFn: () => api.fetchSegments(filters),
  })
}

export function useSegment(id: string) {
  return useQuery({
    queryKey: queryKeys.segments.detail(id),
    queryFn: () => api.fetchSegment(id),
    enabled: !!id,
  })
}

export function useCreateSegment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateSegmentRequest) => api.createSegment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.all })
      toaster.create({ title: "Segment created", type: "success" })
    },
    onError: () => {
      toaster.create({ title: "Failed to create segment", type: "error" })
    },
  })
}

export function useUpdateSegment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateSegmentRequest & { id: string }) =>
      api.updateSegment(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.detail(variables.id) })
    },
    onError: () => {
      toaster.create({ title: "Failed to update segment", type: "error" })
    },
  })
}

export function useDeleteSegment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteSegment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.all })
      toaster.create({ title: "Segment deleted", type: "success" })
    },
    onError: () => {
      toaster.create({ title: "Failed to delete segment", type: "error" })
    },
  })
}
