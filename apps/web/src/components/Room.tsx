import React, { useEffect } from "react"

import { Box, useBreakpointValue } from "@chakra-ui/react"

import Overlays from "./Overlays"
import RoomMobileGrid from "./RoomMobileGrid"
import RoomDesktopSplitter from "./RoomDesktopSplitter"
import { GameStateNewPluginTabsProvider } from "./GameStateNewPluginTabsProvider"
import { PluginComponentsRoomProvider } from "./PluginComponents"

import {
  useCurrentUser,
  useIsNewUser,
  useIsAuthenticated,
  useHasPlaylistTracks,
  usePlaylistSend,
  useListeners,
  useModalsSend,
  useHasQueueItems,
  useNowPlaying,
} from "../hooks/useActors"
import { setCurrentArtworkUrl } from "../hooks/useDynamicTheme"
import { HybridListeningTransportProvider } from "../hooks/useHybridListeningTransport"
import { useMediaSession } from "../hooks/useMediaSession"
import { ensureEmojiMart } from "../lib/ensureEmojiMart"

const Room = ({ id }: { id: string }) => {
  const useDesktopSplitter = useBreakpointValue({ base: false, lg: true }) ?? false

  const currentUser = useCurrentUser()
  const isNewUser = useIsNewUser()
  const isAuthenticated = useIsAuthenticated()
  const hasPlaylistTracks = useHasPlaylistTracks()
  const hasQueueItems = useHasQueueItems()
  const listeners = useListeners()
  const playlistSend = usePlaylistSend()
  const modalSend = useModalsSend()
  const nowPlaying = useNowPlaying()

  useMediaSession()

  useEffect(() => {
    void ensureEmojiMart()
  }, [])

  useEffect(() => {
    if (isNewUser && isAuthenticated) {
      modalSend({ type: "EDIT_USERNAME" })
    }
  }, [isNewUser, isAuthenticated, modalSend])

  useEffect(() => {
    const firstImage = nowPlaying?.track?.album?.images?.[0]
    const url =
      typeof firstImage === "object" && firstImage?.url
        ? firstImage.url
        : typeof firstImage === "string"
        ? firstImage
        : null
    setCurrentArtworkUrl(url)
    return () => setCurrentArtworkUrl(null)
  }, [nowPlaying])

  const layoutProps = {
    currentUser,
    hasPlaylistTracks,
    hasQueueItems,
    listenersCount: listeners.length,
    onShowPlaylist: () => playlistSend({ type: "TOGGLE_PLAYLIST" }),
  }

  return (
    <Box w="100%" h="100%" data-screen-effect-target="room">
      <HybridListeningTransportProvider>
        <PluginComponentsRoomProvider>
          <GameStateNewPluginTabsProvider>
            {useDesktopSplitter ? (
              <RoomDesktopSplitter {...layoutProps} />
            ) : (
              <RoomMobileGrid {...layoutProps} />
            )}

            <Overlays />
          </GameStateNewPluginTabsProvider>
        </PluginComponentsRoomProvider>
      </HybridListeningTransportProvider>
    </Box>
  )
}

export default Room
