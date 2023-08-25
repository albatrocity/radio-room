import React, { memo, lazy, Suspense } from "react"
import { Box, Center, Flex, Spinner } from "@chakra-ui/react"

import NowPlaying from "./NowPlaying"

import { useAuthStore } from "../state/authStore"
import { useIsStationOnline, useStationMeta } from "../state/audioStore"
import createTrackId from "../lib/createTrackId"
import { useCurrentRoom, useCurrentRoomHasAudio } from "../state/roomStore"
import JukeboxControls from "./JukeboxControls"
const RadioControls = lazy(() => import("./RadioControls"))

interface PlayerUiProps {
  onShowPlaylist: () => void
  hasPlaylist: boolean
  listenerCount: number
}

const PlayerUi = ({ onShowPlaylist, hasPlaylist }: PlayerUiProps) => {
  const { state: authState } = useAuthStore()
  const hasAudio = useCurrentRoomHasAudio()
  const room = useCurrentRoom()
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

      {isOnline && hasAudio && room && (
        <Suspense
          fallback={
            <Box p={4} bg="secondaryBg">
              <Center>
                <Spinner />
              </Center>
            </Box>
          }
        >
          <RadioControls
            meta={meta}
            trackId={trackId}
            onShowPlaylist={onShowPlaylist}
            hasPlaylist={hasPlaylist}
            streamUrl={room.radioListenUrl ?? room.radioMetaUrl}
          />
        </Suspense>
      )}
    </Flex>
  )
}

export default memo(PlayerUi)
