import React, { useEffect, useMemo } from "react"

import { Box, Grid, GridItem, useToken } from "@chakra-ui/react"

import PlayerUi from "./PlayerUi"
import Chat from "./Chat"
import Sidebar from "./Sidebar"
import Overlays from "./Overlays"
import IntegratedPanelSlot from "./IntegratedPanel/IntegratedPanelSlot"
import { GameStateNewPluginTabsProvider } from "./GameStateNewPluginTabsProvider"
import { PluginComponentsRoomProvider } from "./PluginComponents"
import KeyboardShortcuts from "./KeyboardShortcuts"
import RoomError from "./RoomError"
import { INTEGRATED_PANEL_WIDTH } from "../lib/integratedPanelSlots"
import { useActiveIntegratedPanelSlot } from "../hooks/useIntegratedPanelPresentation"

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

const Room = ({ id }: { id: string }) => {
  const [xs, sm, md, lg, xl] = useToken("sizes", ["xs", "sm", "md", "lg", "xl"])

  const currentUser = useCurrentUser()
  const isNewUser = useIsNewUser()
  const isAuthenticated = useIsAuthenticated()
  const hasPlaylistTracks = useHasPlaylistTracks()
  const hasQueueItems = useHasQueueItems()
  const listeners = useListeners()
  const playlistSend = usePlaylistSend()
  const modalSend = useModalsSend()
  const nowPlaying = useNowPlaying()
  const activePanelSlot = useActiveIntegratedPanelSlot()
  const panelOpen = activePanelSlot !== null

  const gridTemplateAreas = useMemo(
    () =>
      panelOpen
        ? [
            `"alert alert"
          "header header"
      "chat chat"
      "sidebar sidebar"`,
            `
    "alert alert"
    "header header"
    "chat sidebar"
    `,
            `
          "alert alert alert alert"
          "header chat sidebar panel"`,
          ]
        : [
            `"alert alert"
          "header header"
      "chat chat"
      "sidebar sidebar"`,
            `
    "alert alert"
    "header header"
    "chat sidebar"
    `,
            `
          "alert alert alert"
          "header chat sidebar"`,
          ],
    [panelOpen],
  )

  const gridTemplateColumns = useMemo(
    () =>
      panelOpen
        ? [
            "1fr auto",
            "1fr auto",
            `${xs} 1fr auto ${INTEGRATED_PANEL_WIDTH}`,
            `${md} 1fr auto ${INTEGRATED_PANEL_WIDTH}`,
            `${md} 1fr auto ${INTEGRATED_PANEL_WIDTH}`,
            `${xl} 1fr auto ${INTEGRATED_PANEL_WIDTH}`,
          ]
        : [
            "1fr auto",
            "1fr auto",
            `${xs} 1fr auto`,
            `${md} 1fr auto`,
            `${md} 1fr auto`,
            `${xl} 1fr auto`,
          ],
    [panelOpen, xs, md, xl],
  )

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

  return (
    <Box w="100%" h="100%" data-screen-effect-target="room">
      <HybridListeningTransportProvider>
        <PluginComponentsRoomProvider>
          <GameStateNewPluginTabsProvider>
            <Grid
              h="100%"
              className="room"
              templateAreas={gridTemplateAreas}
              gridTemplateRows={["auto auto 1fr", "auto auto 1fr auto", "auto 1fr"]}
              gridTemplateColumns={gridTemplateColumns}
            >
              <KeyboardShortcuts />
              <GridItem area="alert">
                <RoomError />
              </GridItem>
              <GridItem
                area="header"
                height={["auto", "100%"]}
                minH={0}
                minWidth={["none", "xs"]}
                overflow="hidden"
                flexGrow={0}
                flexShrink={1}
              >
                <PlayerUi
                  onShowPlaylist={() => playlistSend({ type: "TOGGLE_PLAYLIST" })}
                  hasPlaylist={hasPlaylistTracks || hasQueueItems}
                  listenerCount={listeners.length}
                />
              </GridItem>

              <GridItem area="chat" minHeight={0}>
                {currentUser && <Chat />}
              </GridItem>
              <GridItem area="sidebar" h="100%" minH={0} overflow="hidden">
                {currentUser && (
                  <Box hideBelow="sm" h="100%" colorPalette="action">
                    <Sidebar />
                  </Box>
                )}
              </GridItem>
              {panelOpen ? (
                <GridItem area="panel" h="100%" minH={0} minW={0} overflow="hidden">
                  {currentUser && <IntegratedPanelSlot />}
                </GridItem>
              ) : null}
            </Grid>

            <Overlays />
          </GameStateNewPluginTabsProvider>
        </PluginComponentsRoomProvider>
      </HybridListeningTransportProvider>
    </Box>
  )
}

export default Room
