import { memo, lazy, Suspense } from "react"
import { Box, Center, Flex, Spinner } from "@chakra-ui/react"

import NowPlaying from "./NowPlaying"

import {
  useAuthState,
  useIsStationOnline,
  useStationMeta,
  useCurrentTrackId,
  useMetadataSourceTrackId,
  useCurrentRoom,
  useCurrentRoomHasAudio,
} from "../hooks/useActors"
import JukeboxControls from "./JukeboxControls"
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
  const libraryTrackId = useMetadataSourceTrackId() // For library operations (Spotify ID)

  const isJukebox = !hasAudio

  return (
    <Flex
      css={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
      direction="column"
      height="100%"
      bg="primary.solid"
    >
      <NowPlaying meta={meta} />
      {isJukebox && (
        <JukeboxControls
          trackId={trackId}
          libraryTrackId={libraryTrackId}
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
            libraryTrackId={libraryTrackId}
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
