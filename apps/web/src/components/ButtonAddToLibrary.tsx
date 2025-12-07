import { useEffect, useMemo, useCallback } from "react"
import { IconButton } from "@chakra-ui/react"
import { FaRegHeart, FaHeart } from "react-icons/fa"

import { useIsAdmin, useNowPlaying, usePreferredMetadataSource } from "../hooks/useActors"
import { useSocketMachine } from "../hooks/useSocketMachine"
import addToLibraryMachine from "../machines/addToLibraryMachine"
import type { MetadataSourceType } from "../types/Queue"

/**
 * Button to add/remove the currently playing track to the user's library.
 * Uses the user's preferred metadata source (Spotify, Tidal, etc.) to determine
 * which library to add to and which track ID to use.
 */
export default function ButtonAddToLibrary() {
  const isAdmin = useIsAdmin()
  const nowPlaying = useNowPlaying()
  const preferredSource = usePreferredMetadataSource()
  const [state, send] = useSocketMachine(addToLibraryMachine)

  // Get the track ID for the user's preferred metadata source
  // We strictly use the preferred source - no fallback, so the button reflects user's actual preference
  const { trackId, targetService } = useMemo((): {
    trackId: string | undefined
    targetService: MetadataSourceType | undefined
  } => {
    if (!nowPlaying) {
      return { trackId: undefined, targetService: undefined }
    }

    // If user has a preferred source, only use that source (no fallback)
    if (preferredSource) {
      const preferredData = nowPlaying.metadataSources?.[preferredSource]
      if (preferredData?.source?.trackId) {
        return {
          trackId: preferredData.source.trackId,
          targetService: preferredSource,
        }
      }
      // Preferred source doesn't have track data - return undefined (button will be hidden)
      return { trackId: undefined, targetService: preferredSource }
    }

    // No preference set - use primary metadata source
    return {
      trackId: nowPlaying.metadataSource?.trackId,
      targetService: nowPlaying.metadataSource?.type as MetadataSourceType | undefined,
    }
  }, [nowPlaying, preferredSource])

  const isAdded = trackId ? state.context.tracks[trackId] : false

  // Memoize send to avoid stale closures
  const sendSetIds = useCallback(
    (id: string, service: MetadataSourceType) => {
      send({ type: "SET_IDS", data: [id], targetService: service })
    },
    [send],
  )

  useEffect(() => {
    if (trackId && targetService) {
      sendSetIds(trackId, targetService)
    }
  }, [trackId, targetService, sendSetIds])

  // Only show button to room creators (admin) and when we have a valid track ID
  if (!isAdmin || !trackId || !targetService) {
    return null
  }

  return (
    <IconButton
      aria-label={isAdded ? "Remove from library" : "Add to library"}
      size="xs"
      variant="bright"
      colorPalette="action"
      loading={state.matches("loading")}
      disabled={state.matches("loading")}
      onClick={() => {
        isAdded
          ? send({ type: "REMOVE", data: [trackId], targetService })
          : send({ type: "ADD", data: [trackId], targetService })
      }}
    >
      {isAdded ? <FaHeart /> : <FaRegHeart />}
    </IconButton>
  )
}
