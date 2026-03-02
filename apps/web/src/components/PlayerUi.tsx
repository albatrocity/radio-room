import { memo, lazy, Suspense } from "react"
import { Box, Center, Flex, Icon, IconButton, Spinner, Text } from "@chakra-ui/react"

import NowPlaying from "./NowPlaying"

import {
  useAuthState,
  useIsStationOnline,
  useStationMeta,
  useCurrentTrackId,
  useCurrentRoom,
  useCurrentRoomHasAudio,
} from "../hooks/useActors"
import JukeboxControls from "./JukeboxControls"
import { RiPlayListFill } from "react-icons/ri"
const RadioControls = lazy(() => import("./RadioControls"))

interface PlayerUiProps {
  onShowPlaylist: () => void
  hasPlaylist: boolean
  listenerCount: number
}

const PlayerUi = ({ onShowPlaylist, hasPlaylist }: PlayerUiProps) => {
  const authState = useAuthState()
  const hasAudio = useCurrentRoomHasAudio()
  const room = useCurrentRoom()
  const isUnauthorized = authState === "unauthorized"

  // Clean state from audio store
  const isOnline = useIsStationOnline()
  const meta = useStationMeta()
  const trackId = useCurrentTrackId() // For reactions (stable ID)

  const isJukebox = !hasAudio

  return (
    <Flex
      css={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
      direction="column"
      height="100%"
      background="primary.solid"
      layerStyle="themeTransition"
    >
      <NowPlaying meta={meta} />
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

      {!isOnline && hasPlaylist &&
        <Box p={2} bg="actionBg">
          <IconButton
            size="md"
            aria-label="Playlist"
            variant="ghost"
            onClick={onShowPlaylist}
          >
            <Icon boxSize={5} as={RiPlayListFill} />
          </IconButton>
        </Box>
      }
    </Flex>
  )
}

export default memo(PlayerUi)
