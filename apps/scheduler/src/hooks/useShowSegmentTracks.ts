import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { MetadataSourceTrack } from "@repo/types/MetadataSource"
import * as api from "../lib/api"
import { queryKeys } from "../lib/queryClient"
import { toaster } from "../components/ui/toaster"

export function useSpotifyTrackSearch(debouncedQuery: string) {
  const trimmed = debouncedQuery.trim()
  return useQuery({
    queryKey: queryKeys.spotifySearch.query(trimmed),
    queryFn: () => api.searchSpotifyTracks(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
  })
}

export function useSaveShowSegmentTracks(showId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      showSegmentId,
      tracks,
    }: {
      showSegmentId: string
      tracks: MetadataSourceTrack[]
    }) => api.setShowSegmentTracks(showSegmentId, tracks),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.detail(showId) })
      toaster.create({ title: "Segment tracks saved", type: "success" })
    },
    onError: (error: Error) => {
      toaster.create({
        title: "Failed to save segment tracks",
        description: error.message,
        type: "error",
      })
    },
  })
}
