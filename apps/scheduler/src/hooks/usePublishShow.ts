import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HTTPError } from "ky"
import { finalizeShowPublish, prepareShowPublish } from "../lib/api"
import { queryKeys } from "../lib/queryClient"
import { toaster } from "../components/ui/toaster"

async function errorBodyMessage(e: unknown): Promise<string> {
  if (e instanceof HTTPError) {
    try {
      const body = (await e.response.json()) as { error?: string }
      if (body.error) return body.error
    } catch {
      /* ignore */
    }
    return e.message
  }
  if (e instanceof Error) return e.message
  return "Request failed"
}

export function usePrepareShowPublish(showId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => prepareShowPublish(showId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(showId) })
    },
    onError: async (e) => {
      toaster.create({
        title: "Prepare publish failed",
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
