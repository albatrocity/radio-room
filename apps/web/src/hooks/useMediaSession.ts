import { useEffect } from "react"

import {
  useAudioSend,
  useCurrentRoom,
  useCurrentRoomHasAudio,
  useIsPlaying,
  useNowPlaying,
  usePreferredMetadataSource,
  useStationMeta,
} from "./useActors"
import { applyMediaSession, clearMediaSession } from "../lib/mediaSession"
import { featureImageUrl } from "../lib/metadataImages"

/**
 * Publish now-playing to the OS lock screen / Control Center while this room
 * has a local listenable stream. No-ops when Media Session is missing.
 */
export function useMediaSession(): void {
  const hasAudio = useCurrentRoomHasAudio()
  const playing = useIsPlaying()
  const nowPlaying = useNowPlaying()
  const stationMeta = useStationMeta()
  const room = useCurrentRoom()
  const preferredSource = usePreferredMetadataSource()
  const audioSend = useAudioSend()

  useEffect(() => {
    if (!hasAudio) {
      clearMediaSession()
      return
    }

    const preferred =
      preferredSource && nowPlaying?.metadataSources?.[preferredSource]
        ? nowPlaying.metadataSources[preferredSource]!.track
        : nowPlaying?.track

    const title =
      preferred?.title ||
      stationMeta?.track ||
      stationMeta?.title?.replace(/\|/g, "").trim() ||
      room?.title ||
      "Listening Room"

    const artist =
      preferred?.artists?.map((a) => a.title).filter(Boolean).join(", ") || stationMeta?.artist
    const album = preferred?.album?.title || stationMeta?.album
    const artworkUrl = featureImageUrl(preferred?.album?.images) ?? null

    applyMediaSession(
      {
        title,
        artist,
        album,
        artworkUrl,
        playing,
      },
      {
        play: () => audioSend({ type: "PLAY" }),
        pause: () => audioSend({ type: "STOP" }),
      },
    )

    return () => {
      clearMediaSession()
    }
  }, [
    hasAudio,
    playing,
    nowPlaying,
    stationMeta,
    room?.title,
    preferredSource,
    audioSend,
  ])
}
