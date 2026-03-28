import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { QueryKey } from "@tanstack/react-query"
import { queryKeys } from "../lib/queryClient"
import * as api from "../lib/api"
import type {
  SegmentDTO,
  SegmentFilters,
  CreateSegmentRequest,
  UpdateSegmentRequest,
} from "@repo/types"
import { toaster } from "../components/ui/toaster"

function updateRequestToDtoPatch(
  variables: { id: string } & UpdateSegmentRequest,
): Partial<SegmentDTO> {
  const { id: _id, ...req } = variables
  const patch: Partial<SegmentDTO> = {}
  if (req.title !== undefined) patch.title = req.title
  if (req.description !== undefined) patch.description = req.description
  if (req.isRecurring !== undefined) patch.isRecurring = req.isRecurring
  if (req.duration !== undefined) patch.duration = req.duration
  if (req.pluginPreset !== undefined) patch.pluginPreset = req.pluginPreset
  if (req.status !== undefined) patch.status = req.status
  return patch
}

/** List cache: patch row or drop it if `filters.status` no longer matches. */
function optimisticSegmentList(
  segments: SegmentDTO[] | undefined,
  segmentId: string,
  patch: Partial<SegmentDTO>,
  filters: SegmentFilters,
): SegmentDTO[] | undefined {
  if (!segments) return segments
  const idx = segments.findIndex((s) => s.id === segmentId)
  if (idx === -1) return segments

  const newStatus = patch.status
  if (
    filters.status !== undefined &&
    newStatus !== undefined &&
    newStatus !== filters.status
  ) {
    return segments.filter((s) => s.id !== segmentId)
  }

  return segments.map((s) => (s.id === segmentId ? { ...s, ...patch } : s))
}

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

type UpdateSegmentContext = {
  previousListQueries: [QueryKey, SegmentDTO[] | undefined][]
  detailKey: ReturnType<typeof queryKeys.segments.detail>
  previousDetail: SegmentDTO | undefined
}

export function useUpdateSegment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: UpdateSegmentRequest & { id: string }) =>
      api.updateSegment(id, data),
    onMutate: async (variables): Promise<UpdateSegmentContext> => {
      await queryClient.cancelQueries({ queryKey: queryKeys.segments.all })

      const allCached = queryClient.getQueriesData<SegmentDTO[]>({
        queryKey: queryKeys.segments.all,
      })

      const previousListQueries: [QueryKey, SegmentDTO[] | undefined][] = []
      for (const [queryKey, data] of allCached) {
        if (!Array.isArray(queryKey) || queryKey[1] !== "list") continue
        previousListQueries.push([queryKey, data])
      }

      const detailKey = queryKeys.segments.detail(variables.id)
      const previousDetail = queryClient.getQueryData<SegmentDTO>(detailKey)

      const patch = updateRequestToDtoPatch(variables)

      for (const [queryKey, data] of previousListQueries) {
        const filters = (Array.isArray(queryKey) ? queryKey[2] : {}) as SegmentFilters
        const next = optimisticSegmentList(data, variables.id, patch, filters)
        queryClient.setQueryData(queryKey, next)
      }

      queryClient.setQueryData<SegmentDTO>(detailKey, (old) =>
        old ? { ...old, ...patch } : old,
      )

      return { previousListQueries, detailKey, previousDetail }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousListQueries) {
        for (const [queryKey, data] of context.previousListQueries) {
          queryClient.setQueryData(queryKey, data)
        }
      }
      if (context?.detailKey !== undefined) {
        queryClient.setQueryData(context.detailKey, context.previousDetail)
      }
      toaster.create({ title: "Failed to update segment", type: "error" })
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.all })
      if (variables) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.segments.detail(variables.id),
        })
      }
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
