import { Fragment, memo } from "react"
import { Box, Splitter } from "@chakra-ui/react"

import PlayerUi from "./PlayerUi"
import Chat from "./Chat"
import Sidebar from "./Sidebar"
import KeyboardShortcuts from "./KeyboardShortcuts"
import RoomError from "./RoomError"
import IntegratedPanelSlot from "./IntegratedPanel/IntegratedPanelSlot"
import { useRoomLayoutSplitter } from "../hooks/useRoomLayoutSplitter"

type Props = {
  currentUser: ReturnType<typeof import("../hooks/useActors").useCurrentUser>
  hasPlaylistTracks: boolean
  hasQueueItems: boolean
  listenersCount: number
  onShowPlaylist: () => void
}

const PANEL_LABELS: Record<string, string> = {
  "player:chat": "Resize Now Playing and chat",
  "chat:sidebar": "Resize chat and listeners",
  "sidebar:panel": "Resize listeners and panel",
}

function RoomDesktopSplitter({
  currentUser,
  hasPlaylistTracks,
  hasQueueItems,
  listenersCount,
  onShowPlaylist,
}: Props) {
  const { splitter, resetLayout } = useRoomLayoutSplitter()
  const items = splitter.getItems()

  return (
    <Box h="100%" display="flex" flexDirection="column" className="room room--splitter">
      <KeyboardShortcuts />
      <Box flexShrink={0}>
        <RoomError />
      </Box>
      <Box flex="1" minH={0} overflow="hidden">
        <Splitter.RootProvider value={splitter} h="100%">
          {items.map((item) => (
            <Fragment key={item.id}>
              {item.type === "panel" ? (
                <Splitter.Panel
                  id={item.id}
                  h="100%"
                  minH={0}
                  minW={0}
                  overflow="hidden"
                  transition="none"
                >
                  {item.id === "player" ? (
                    <Box h="100%" minH={0} minW={0} overflow="hidden">
                      <PlayerUi
                        onShowPlaylist={onShowPlaylist}
                        hasPlaylist={hasPlaylistTracks || hasQueueItems}
                        listenerCount={listenersCount}
                      />
                    </Box>
                  ) : null}
                  {item.id === "chat" ? (
                    <Box h="100%" minH={0} minW={0} overflow="hidden">
                      {currentUser ? <Chat /> : null}
                    </Box>
                  ) : null}
                  {item.id === "sidebar" ? (
                    <Box h="100%" minH={0} minW={0} overflow="hidden" colorPalette="action">
                      {currentUser ? <Sidebar /> : null}
                    </Box>
                  ) : null}
                  {item.id === "panel" ? (
                    <Box h="100%" minH={0} minW={0} overflow="hidden">
                      {currentUser ? <IntegratedPanelSlot /> : null}
                    </Box>
                  ) : null}
                </Splitter.Panel>
              ) : (
                <Splitter.ResizeTrigger
                  id={item.id}
                  aria-label={PANEL_LABELS[item.id] ?? "Resize columns"}
                  onDoubleClick={resetLayout}
                >
                  <Splitter.ResizeTriggerSeparator />
                </Splitter.ResizeTrigger>
              )}
            </Fragment>
          ))}
        </Splitter.RootProvider>
      </Box>
    </Box>
  )
}

export default memo(RoomDesktopSplitter)
