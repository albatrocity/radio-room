import { memo } from "react"
import { Box, Heading, HStack, VStack } from "@chakra-ui/react"

import {
  useUsers,
  useCurrentRoom,
  useRoomState,
  useIsAdmin,
  useMediaSourceStatus,
  useNowPlaying,
} from "../../hooks/useActors"
import { RoomMeta } from "../../types/Room"

import { NowPlayingLoading } from "./NowPlayingLoading"
import { NowPlayingEmpty } from "./NowPlayingEmpty"
import { NowPlayingTrack } from "./NowPlayingTrack"
import ButtonAddToQueue from "../ButtonAddToQueue"
import ButtonPolls from "../ButtonPolls"
import { PluginArea } from "../PluginComponents"

interface NowPlayingProps {
  meta?: RoomMeta
}

type DisplayState = "loading" | "waiting" | "empty" | "playing" | "streamingNoTrack"

function useDisplayState(meta?: RoomMeta): DisplayState {
  const roomState = useRoomState()
  const mediaSourceStatus = useMediaSourceStatus()
  const nowPlaying = useNowPlaying()
  const hasTrackData = !!meta?.nowPlaying?.track || !!nowPlaying?.track

  if (roomState === "loading") {
    return "loading"
  }

  if (roomState === "success" && mediaSourceStatus === "unknown") {
    return "waiting"
  }

  if (roomState === "success" && mediaSourceStatus === "offline" && !hasTrackData) {
    return "empty"
  }

  if (hasTrackData) {
    return "playing"
  }

  if (mediaSourceStatus === "online") {
    return "streamingNoTrack"
  }

  return "empty"
}

function NowPlaying({ meta }: NowPlayingProps) {
  const users = useUsers()
  const room = useCurrentRoom()
  const isAdmin = useIsAdmin()

  const displayState = useDisplayState(meta)

  return (
    <Box
      p={3}
      // background="primary"
      alignContent="center"
      alignItems="center"
      justifyContent="center"
      flex="1 1 auto"
      minH={0}
      overflow="hidden"
      layerStyle="themeTransition"
    >
      <VStack
        gap={4}
        justify="space-between"
        height="100%"
        width="100%"
        minH={0}
        overflow="hidden"
      >
        {displayState === "loading" && <NowPlayingLoading />}

        {displayState === "waiting" && <NowPlayingLoading message="Getting Now Playing data..." />}

        {displayState === "empty" && (
          <NowPlayingEmpty roomType={room?.type ?? "jukebox"} isAdmin={isAdmin} />
        )}

        {displayState === "streamingNoTrack" && (
          <VStack gap={2} px={4} alignContent="flex-start" flexShrink={0}>
            <Heading w="100%" as="h2" size="lg" color="whiteAlpha.900" textAlign="left">
              {room?.title ?? "Live"}
            </Heading>
          </VStack>
        )}

        {displayState === "playing" && meta && (
          <NowPlayingTrack meta={meta} room={room} users={users} />
        )}

        <Box flexShrink={0} w="100%">
          <PluginArea area="nowPlaying" />
        </Box>

        <Box hideBelow="sm" colorPalette="primary" flexShrink={0}>
          <HStack>
            <ButtonAddToQueue variant="subtle" />
            <ButtonPolls variant="subtle" />
          </HStack>
        </Box>
      </VStack>
    </Box>
  )
}

export default memo(NowPlaying)
