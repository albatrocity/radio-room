import { Fragment, memo, type ReactNode } from "react"
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

const PlayerColumn = memo(function PlayerColumn({
  onShowPlaylist,
  hasPlaylist,
  listenerCount,
}: {
  onShowPlaylist: () => void
  hasPlaylist: boolean
  listenerCount: number
}) {
  return (
    <Box h="100%" minH={0} minW={0} overflow="hidden">
      <PlayerUi
        onShowPlaylist={onShowPlaylist}
        hasPlaylist={hasPlaylist}
        listenerCount={listenerCount}
      />
    </Box>
  )
})

const ChatColumn = memo(function ChatColumn({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Box h="100%" minH={0} minW={0} overflow="hidden">
      <Chat />
    </Box>
  )
})

const SidebarColumn = memo(function SidebarColumn({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Box h="100%" minH={0} minW={0} overflow="hidden" colorPalette="action">
      <Sidebar />
    </Box>
  )
})

const PanelColumn = memo(function PanelColumn({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <Box h="100%" minH={0} minW={0} overflow="hidden">
      <IntegratedPanelSlot />
    </Box>
  )
})

function renderPanel(
  id: string,
  props: {
    hasUser: boolean
    onShowPlaylist: () => void
    hasPlaylist: boolean
    listenerCount: number
  },
): ReactNode {
  if (id === "player") {
    return (
      <PlayerColumn
        onShowPlaylist={props.onShowPlaylist}
        hasPlaylist={props.hasPlaylist}
        listenerCount={props.listenerCount}
      />
    )
  }
  if (id === "chat") return <ChatColumn visible={props.hasUser} />
  if (id === "sidebar") return <SidebarColumn visible={props.hasUser} />
  if (id === "panel") return <PanelColumn visible={props.hasUser} />
  return null
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
  const columnProps = {
    hasUser: Boolean(currentUser),
    onShowPlaylist,
    hasPlaylist: hasPlaylistTracks || hasQueueItems,
    listenerCount: listenersCount,
  }

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
                  {renderPanel(item.id, columnProps)}
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
