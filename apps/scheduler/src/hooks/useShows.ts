import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { queryKeys } from "../lib/queryClient"
import * as api from "../lib/api"
import type {
  CreateShowRequest,
  SegmentDTO,
  ShowDTO,
  ShowFilters,
  ShowSegmentDTO,
  UpdateShowRequest,
} from "@repo/types"
import { toaster } from "../components/ui/toaster"

function findSegmentDtoInCache(
  queryClient: QueryClient,
  segmentId: string,
): SegmentDTO | undefined {
  const entries = queryClient.getQueriesData<SegmentDTO[]>({
    queryKey: queryKeys.segments.all,
  })
  for (const [queryKey, data] of entries) {
    if (!Array.isArray(queryKey) || queryKey[1] !== "list") continue
    const found = data?.find((s) => s.id === segmentId)
    if (found) return found
  }
  return undefined
}

function buildOptimisticShowSegments(
  queryClient: QueryClient,
  previousShow: ShowDTO,
  segmentIds: string[],
): ShowSegmentDTO[] | null {
  const prevSegments = previousShow.segments ?? []
  const bySegmentId = new Map(prevSegments.map((s) => [s.segmentId, s]))

  const next: ShowSegmentDTO[] = []
  for (let index = 0; index < segmentIds.length; index++) {
    const segmentId = segmentIds[index]
    const existing = bySegmentId.get(segmentId)
    if (existing) {
      next.push({ ...existing, position: index })
      continue
    }
    const fromCache = findSegmentDtoInCache(queryClient, segmentId)
    if (!fromCache) return null
    next.push({
      id: `optimistic-${segmentId}`,
      segmentId,
      position: index,
      durationOverride: null,
      segment: fromCache,
    })
  }
  return next
}

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

type ReorderContext = { previousShow: ShowDTO | undefined }

export function useUpdateShowSegmentDuration() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      showId,
      segmentId,
      durationOverride,
    }: {
      showId: string
      segmentId: string
      durationOverride: number | null
    }) => api.updateShowSegmentDuration(showId, segmentId, durationOverride),
    onMutate: async ({ showId, segmentId, durationOverride }) => {
      const detailKey = queryKeys.shows.detail(showId)
      await queryClient.cancelQueries({ queryKey: detailKey })
      const previousShow = queryClient.getQueryData<ShowDTO>(detailKey)
      if (previousShow?.segments) {
        queryClient.setQueryData<ShowDTO>(detailKey, {
          ...previousShow,
          segments: previousShow.segments.map((s) =>
            s.segmentId === segmentId ? { ...s, durationOverride } : s,
          ),
        })
      }
      return { previousShow }
    },
    onError: (_err, variables, context) => {
      if (context?.previousShow !== undefined) {
        queryClient.setQueryData(queryKeys.shows.detail(variables.showId), context.previousShow)
      }
      toaster.create({ title: "Failed to update duration", type: "error" })
    },
    onSettled: (_data, _err, variables) => {
      if (variables) {
        queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(variables.showId) })
      }
    },
  })
}

export function useReorderShowSegments() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ showId, segmentIds }: { showId: string; segmentIds: string[] }) =>
      api.reorderShowSegments(showId, segmentIds),
    onMutate: async ({ showId, segmentIds }): Promise<ReorderContext> => {
      const detailKey = queryKeys.shows.detail(showId)
      await queryClient.cancelQueries({ queryKey: detailKey })

      const previousShow = queryClient.getQueryData<ShowDTO>(detailKey)
      if (!previousShow) {
        return { previousShow }
      }

      const nextSegments = buildOptimisticShowSegments(
        queryClient,
        previousShow,
        segmentIds,
      )
      if (!nextSegments) {
        return { previousShow }
      }

      queryClient.setQueryData<ShowDTO>(detailKey, {
        ...previousShow,
        segments: nextSegments,
      })

      return { previousShow }
    },
    onError: (_err, variables, context) => {
      if (context?.previousShow !== undefined) {
        queryClient.setQueryData(
          queryKeys.shows.detail(variables.showId),
          context.previousShow,
        )
      }
      toaster.create({ title: "Failed to reorder segments", type: "error" })
    },
    onSettled: (_data, _err, variables) => {
      if (variables) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.shows.detail(variables.showId),
        })
      }
    },
  })
}
