import { memo, lazy, Suspense, useMemo } from "react"
import { Box, Center, Flex, Icon, IconButton, Spinner } from "@chakra-ui/react"

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
import { LuListMusic } from "react-icons/lu"
const RadioControls = lazy(() => import("./RadioControls"))
const LivePlayer = lazy(() => import("./LivePlayer"))
import { useHybridListeningTransport } from "../hooks/useHybridListeningTransport"

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

  const isOnline = useIsStationOnline()
  const meta = useStationMeta()
  const trackId = useCurrentTrackId()
  const { listeningTransport, isHybrid, hybridReady, webrtcExperimentalStatus } =
    useHybridListeningTransport()

  const isJukebox = !hasAudio

  const showPlayer = useMemo(() => {
    if (!hasAudio || !room) return false
    if (!isHybrid) return isOnline
    if (listeningTransport === "shoutcast") return isOnline
    return webrtcExperimentalStatus !== "offline"
  }, [hasAudio, room, isHybrid, listeningTransport, isOnline, webrtcExperimentalStatus])

  const showPlaylistOnly = !showPlayer && hasPlaylist

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

      {showPlayer && (
        <Suspense
          fallback={
            <Box p={4} bg="secondaryBg">
              <Center>
                <Spinner />
              </Center>
            </Box>
          }
        >
          {room?.type === "live" ? (
            <LivePlayer
              trackId={trackId}
              onShowPlaylist={onShowPlaylist}
              hasPlaylist={hasPlaylist}
              whepUrl={room.radioListenUrl}
              hlsUrl={room.radioMetaUrl}
            />
          ) : isHybrid && listeningTransport === "webrtc" && hybridReady ? (
            <LivePlayer
              key="hybrid-webrtc"
              trackId={trackId}
              onShowPlaylist={onShowPlaylist}
              hasPlaylist={hasPlaylist}
              whepUrl={room.liveWhepUrl}
              hlsUrl={room.liveHlsUrl}
            />
          ) : (
            <RadioControls
              key="shoutcast"
              trackId={trackId}
              onShowPlaylist={onShowPlaylist}
              hasPlaylist={hasPlaylist}
              streamUrl={room?.radioListenUrl ?? room?.radioMetaUrl}
            />
          )}
        </Suspense>
      )}

      {showPlaylistOnly && (
        <Box p={2} bg="actionBg">
          <IconButton
            size="md"
            aria-label="Playlist"
            variant="ghost"
            onClick={onShowPlaylist}
          >
            <Icon boxSize={5} as={LuListMusic} />
          </IconButton>
        </Box>
      )}
    </Flex>
  )
}

export default memo(PlayerUi)
