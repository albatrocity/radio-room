import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../lib/queryClient"
import * as api from "../lib/api"
import type { CreateTagRequest, TagType } from "@repo/types"
import { toaster } from "../components/ui/toaster"

export function useTags(type?: TagType) {
  return useQuery({
    queryKey: queryKeys.tags.list(type),
    queryFn: () => api.fetchTags(type),
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTagRequest) => api.createTag(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
      toaster.create({ title: "Tag created", type: "success" })
    },
    onError: () => {
      toaster.create({ title: "Failed to create tag", type: "error" })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
      toaster.create({ title: "Tag deleted", type: "success" })
    },
    onError: () => {
      toaster.create({ title: "Failed to delete tag", type: "error" })
    },
  })
}
