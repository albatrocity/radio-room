import { memo } from "react"
import { Box, VStack } from "@chakra-ui/react"

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
import { PluginArea } from "../PluginComponents"

interface NowPlayingProps {
  meta?: RoomMeta
}

type DisplayState = "loading" | "waiting" | "empty" | "playing"

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

  // Fallback - show empty if we have no data
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
      flexGrow={1}
      height="100%"
      layerStyle="themeTransition"
    >
      <VStack gap={4} justify="space-between" height="100%" width="100%">
        {displayState === "loading" && <NowPlayingLoading />}

        {displayState === "waiting" && <NowPlayingLoading message="Getting Now Playing data..." />}

        {displayState === "empty" && (
          <NowPlayingEmpty roomType={room?.type ?? "jukebox"} isAdmin={isAdmin} />
        )}

        {displayState === "playing" && meta && (
          <NowPlayingTrack meta={meta} room={room} users={users} />
        )}

        <PluginArea area="nowPlaying" />

        <Box hideBelow="sm" colorPalette="primary">
          <ButtonAddToQueue variant="subtle" />
        </Box>
      </VStack>
    </Box>
  )
}

export default memo(NowPlaying)
