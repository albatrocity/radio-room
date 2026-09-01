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
import {
  applyMediaSessionMetadata,
  clearMediaSession,
  getMediaSessionDebug,
  setMediaSessionHandlers,
  setMediaSessionPlaybackState,
} from "../lib/mediaSession"
import { mediaSessionArtwork } from "../lib/metadataImages"

/**
 * Publish now-playing to the OS lock screen / Control Center while this room
 * has a local listenable stream. No-ops when Media Session is missing.
 *
 * `useStationMeta` hands back a new object on every server meta tick, so the
 * effects below key on derived values rather than object identity — otherwise
 * the metadata (and with it the artwork fetch) restarts every few seconds.
 */
export function useMediaSession(): void {
  const hasAudio = useCurrentRoomHasAudio()
  const playing = useIsPlaying()
  const nowPlaying = useNowPlaying()
  const stationMeta = useStationMeta()
  const room = useCurrentRoom()
  const preferredSource = usePreferredMetadataSource()
  const audioSend = useAudioSend()

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

  // Same precedence the Now Playing panel uses, so the lock screen shows the
  // cover the room is already showing.
  const useRoomArtwork = Boolean(
    room?.artwork && (!room.artworkStreamingOnly || !room.fetchMeta),
  )
  const artwork = useRoomArtwork
    ? [{ src: room!.artwork! }]
    : mediaSessionArtwork(preferred?.album?.images, room?.artwork)
  const artworkKey = artwork.map((image) => image.src).join("|")

  useEffect(() => {
    if (!hasAudio) return
    applyMediaSessionMetadata({ title, artist, album, artwork })
    // `artwork` is covered by `artworkKey`; depending on the array itself would
    // rebuild the metadata on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAudio, title, artist, album, artworkKey])

  useEffect(() => {
    if (!hasAudio) return
    setMediaSessionPlaybackState(playing)
  }, [hasAudio, playing])

  useEffect(() => {
    if (!hasAudio) return
    setMediaSessionHandlers({
      play: () => audioSend({ type: "PLAY" }),
      pause: () => audioSend({ type: "STOP" }),
    })
  }, [hasAudio, audioSend])

  useEffect(() => {
    if (!hasAudio) clearMediaSession()
    if (import.meta.env.DEV) {
      ;(window as Window & { __mediaSessionDebug?: () => unknown }).__mediaSessionDebug =
        getMediaSessionDebug
    }
    return () => clearMediaSession()
  }, [hasAudio])
}
