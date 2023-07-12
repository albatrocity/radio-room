import React, { memo } from "react"
import { Flex } from "@chakra-ui/react"

import NowPlaying from "./NowPlaying"

import { useAuthStore } from "../state/authStore"
import { useIsStationOnline, useStationMeta } from "../state/audioStore"
import createTrackId from "../lib/createTrackId"
import { useCurrentRoomHasAudio } from "../state/roomStore"
import JukeboxControls from "./JukeboxControls"
import RadioControls from "./RadioControls"

interface PlayerUiProps {
  onShowPlaylist: () => void
  hasPlaylist: boolean
  listenerCount: number
}

const PlayerUi = ({ onShowPlaylist, hasPlaylist }: PlayerUiProps) => {
  const { state: authState } = useAuthStore()
  const hasAudio = useCurrentRoomHasAudio()
  const isUnauthorized = authState.matches("unauthorized")

  const isOnline = useIsStationOnline()

  const meta = useStationMeta()
  const { album, artist, track } = meta ?? {}
  const trackId = createTrackId({ track, artist, album })
  const isJukebox = !hasAudio

  return (
    <Flex
      sx={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
      direction="column"
      height="100%"
    >
      {meta && <NowPlaying offline={!isOnline} meta={meta} />}
      {isJukebox && (
        <JukeboxControls
          meta={meta}
          trackId={trackId}
          onShowPlaylist={onShowPlaylist}
          hasPlaylist={hasPlaylist}
        />
      )}

      {isOnline && hasAudio && (
        <RadioControls
          meta={meta}
          trackId={trackId}
          onShowPlaylist={onShowPlaylist}
          hasPlaylist={hasPlaylist}
        />
      )}
    </Flex>
  )
}

export default memo(PlayerUi)
