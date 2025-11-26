import { memo, lazy, Suspense } from "react"
import { Box, Center, Flex, Spinner } from "@chakra-ui/react"

import NowPlaying from "./NowPlaying"

import { useAuthStore } from "../state/authStore"
import {
  useIsStationOnline,
  useStationMeta,
  useCurrentTrackId,
  useMediaSourceStatus,
} from "../state/audioStore"
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

  // Clean state from audio store
  const isOnline = useIsStationOnline()
  const meta = useStationMeta()
  const trackId = useCurrentTrackId()
  const mediaSourceStatus = useMediaSourceStatus()

  const isJukebox = !hasAudio

  return (
    <Flex
      sx={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
      direction="column"
      height="100%"
    >
      <NowPlaying offline={mediaSourceStatus === "offline"} meta={meta} />
      {isJukebox && (
        <JukeboxControls
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
