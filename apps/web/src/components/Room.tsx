import React, { useEffect } from "react"

import { Box, Grid, GridItem, useToken } from "@chakra-ui/react"

import PlayerUi from "./PlayerUi"
import Chat from "./Chat"
import Sidebar from "./Sidebar"
import Overlays from "./Overlays"
import KeyboardShortcuts from "./KeyboardShortcuts"

import { useAuthStore, useCurrentUser } from "../state/authStore"
import { useCurrentPlaylist, usePlaylistStore } from "../state/playlistStore"
import { useListeners } from "../state/usersStore"
import { useModalsStore } from "../state/modalsState"
import RoomError from "./RoomError"

const Room = ({ id }: { id: string }) => {
  const [xs, sm, md, lg, xl] = useToken("sizes", ["xs", "sm", "md", "lg", "xl"])

  const authStore = useAuthStore()
  const authContext = useAuthStore((s) => s.state.context)
  const currentUser = useCurrentUser()
  const { send: playlistSend } = usePlaylistStore()

  const isNewUser = authContext.isNewUser
  const { send: modalSend } = useModalsStore()
  const playlist = useCurrentPlaylist()
  const listeners = useListeners()

  useEffect(() => {
    if (isNewUser && authStore.state.matches("authenticated")) {
      modalSend("EDIT_USERNAME")
    }
  }, [isNewUser, authStore.state])

  return (
    <Box w="100%" h="100%">
      <Grid
        flexGrow={1}
        flexShrink={1}
        h="100%"
        className="room"
        templateAreas={[
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
        ]}
        gridTemplateRows={["auto auto 1fr", "auto auto 1fr auto", "auto 1fr"]}
        gridTemplateColumns={[
          "1fr auto",
          "1fr auto",
          `${xs} 1fr auto`,
          `${md} 1fr auto`,
          `${md} 1fr auto`,
          `${xl} 1fr auto`,
        ]}
      >
        <KeyboardShortcuts />
        <GridItem area="alert">
          <RoomError />
        </GridItem>
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
          {currentUser && <Chat />}
        </GridItem>
        <GridItem area="sidebar" h="100%">
          {currentUser && (
            <Box hideBelow="sm" h="100%">
              <Sidebar />
            </Box>
          )}
        </GridItem>
      </Grid>

      <Overlays />
    </Box>
  )
}

export default Room
