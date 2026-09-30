import { useMutation, useQueryClient } from "@tanstack/react-query"
import { finalizeShowPublish, syncPublishPlaylist, continuePublish } from "../lib/api"
import { queryKeys } from "../lib/queryClient"
import { errorBodyMessage } from "../lib/errorBodyMessage"
import { toaster } from "../components/ui/toaster"

export function useSyncPublishPlaylist(showId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => syncPublishPlaylist(showId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(showId) })
    },
    onError: async (e) => {
      toaster.create({
        title: "Sync failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

export function useContinuePublish(showId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedTrackKeys: string[]) => continuePublish(showId, orderedTrackKeys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(showId) })
    },
    onError: async (e) => {
      toaster.create({
        title: "Continue failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}

export function useFinalizeShowPublish(showId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (markdown: string) => finalizeShowPublish(showId, markdown),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(showId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.all })
      toaster.create({ title: "Archive saved", type: "success" })
    },
    onError: async (e) => {
      toaster.create({
        title: "Publish failed",
        description: await errorBodyMessage(e),
        type: "error",
      })
    },
  })
}
