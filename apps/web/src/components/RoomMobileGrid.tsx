import { memo } from "react"
import { Box, Grid, GridItem, useToken } from "@chakra-ui/react"

import PlayerUi from "./PlayerUi"
import Chat from "./Chat"
import Sidebar from "./Sidebar"
import KeyboardShortcuts from "./KeyboardShortcuts"
import RoomError from "./RoomError"

type Props = {
  currentUser: ReturnType<typeof import("../hooks/useActors").useCurrentUser>
  hasPlaylistTracks: boolean
  hasQueueItems: boolean
  listenersCount: number
  onShowPlaylist: () => void
}

function RoomMobileGrid({
  currentUser,
  hasPlaylistTracks,
  hasQueueItems,
  listenersCount,
  onShowPlaylist,
}: Props) {
  const [xs, sm, md, lg, xl] = useToken("sizes", ["xs", "sm", "md", "lg", "xl"])

  return (
    <Grid
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
        minH={0}
        minWidth={["none", "xs"]}
        overflow="hidden"
        flexGrow={0}
        flexShrink={1}
      >
        <PlayerUi
          onShowPlaylist={onShowPlaylist}
          hasPlaylist={hasPlaylistTracks || hasQueueItems}
          listenerCount={listenersCount}
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
    </Grid>
  )
}

export default memo(RoomMobileGrid)
