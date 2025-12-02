import { memo } from "react"
import { Box, VStack, Show } from "@chakra-ui/react"

import { useUsers } from "../../state/usersStore"
import { useCurrentRoom, useRoomStore } from "../../state/roomStore"
import { useIsAdmin } from "../../state/authStore"
import { useMediaSourceStatus, useHasTrackData } from "../../state/audioStore"
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
  const { state: roomState } = useRoomStore()
  const mediaSourceStatus = useMediaSourceStatus()
  const hasTrackDataFromStore = useHasTrackData()
  const hasTrackData = !!meta?.nowPlaying?.track || hasTrackDataFromStore

  if (roomState.matches("loading")) {
    return "loading"
  }

  if (roomState.matches("success") && mediaSourceStatus === "unknown") {
    return "waiting"
  }

  if (roomState.matches("success") && mediaSourceStatus === "offline" && !hasTrackData) {
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
      background="primary"
      alignContent="center"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
      height="100%"
    >
      <VStack spacing={4} justify="space-between" height="100%" width="100%">
        {displayState === "loading" && <NowPlayingLoading />}

        {displayState === "waiting" && <NowPlayingLoading message="Getting Now Playing data..." />}

        {displayState === "empty" && (
          <NowPlayingEmpty roomType={room?.type ?? "jukebox"} isAdmin={isAdmin} />
        )}

        {displayState === "playing" && meta && (
          <NowPlayingTrack meta={meta} room={room} users={users} />
        )}

        <PluginArea area="nowPlaying" />

        <Show above="sm">
          <ButtonAddToQueue variant="solid" />
        </Show>
      </VStack>
    </Box>
  )
}

export default memo(NowPlaying)
