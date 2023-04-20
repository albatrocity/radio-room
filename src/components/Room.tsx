import React, { useCallback, useEffect } from "react"
import { useSelector } from "@xstate/react"
import Konami from "react-konami-code"

import { Box, Grid, GridItem, Show, useToken } from "@chakra-ui/react"

import PlayerUi from "./PlayerUi"
import Chat from "./Chat"
import Sidebar from "./Sidebar"
import Overlays from "./Overlays"
import useGlobalContext from "./useGlobalContext"
import KeyboardShortcuts from "./KeyboardShortcuts"

import { useAuthStore } from "../state/authStore"
import { useCurrentPlaylist, usePlaylistStore } from "../state/playlistStore"
import { useListeners } from "../state/usersStore"
import { useModalsStore } from "../state/modalsState"

const isEditingSelector = (state) =>
  state.matches("connected.participating.editing")

const Room = () => {
  const [sizeXs] = useToken("sizes", ["xs"])

  const authContext = useAuthStore((s) => s.state.context)
  const { send: playlistSend } = usePlaylistStore()

  const globalServices = useGlobalContext()
  const isEditing = useSelector(globalServices.roomService, isEditingSelector)
  const isNewUser = authContext.isNewUser
  const isAdmin = authContext.isAdmin
  const { send: modalSend } = useModalsStore()
  const playlist = useCurrentPlaylist()
  const listeners = useListeners()

  useEffect(() => {
    if (isNewUser) {
      modalSend("EDIT_USERNAME")
    }
  }, [isNewUser])

  useEffect(() => {
    if (isAdmin) {
      globalServices.roomService.send("ACTIVATE_ADMIN")
    }
  }, [isAdmin])

  const handleActivateAdmin = useCallback(
    () => globalServices.roomService.send("ACTIVATE_ADMIN"),
    [globalServices.roomService],
  )

  return (
    <Box w="100%" h="100%">
      <Grid
        flexGrow={1}
        flexShrink={1}
        h="100%"
        className="room"
        templateAreas={[
          `"header header"
      "chat chat"
      "sidebar sidebar"`,
          `
    "header header"
    "chat sidebar"
    `,
          `"header chat sidebar"`,
        ]}
        gridTemplateRows={["auto 1fr", "auto 1fr auto", "100vh"]}
        gridTemplateColumns={["1fr auto", "1fr auto", `${sizeXs} 1fr auto`]}
      >
        <Konami action={handleActivateAdmin} />
        <KeyboardShortcuts />

        <GridItem
          area="header"
          height={["auto", "100%"]}
          minWidth={["none", "xs"]}
          flexGrow={0}
          flexShrink={1}
        >
          <PlayerUi
            onShowPlaylist={() => playlistSend("TOGGLE_PLAYLIST")}
            hasPlaylist={playlist.length > 0}
            listenerCount={listeners.length}
          />
        </GridItem>

        <GridItem area="chat" minHeight={0}>
          <Chat modalActive={isEditing} />
        </GridItem>
        <GridItem area="sidebar" h="100%">
          <Show above="sm">
            <Sidebar />
          </Show>
        </GridItem>
      </Grid>

      <Overlays />
    </Box>
  )
}

export default Room
