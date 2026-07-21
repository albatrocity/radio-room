import { memo } from "react"
import { Box } from "@chakra-ui/react"

import DrawerBookmarks from "./Drawers/DrawerBookmarks"
import DrawerPlaylist from "./Drawers/DrawerPlaylist"
import DrawerListeners from "./Drawers/DrawerListeners"

import ModalEditUsername from "./Modals/ModalEditUsername"
import ModalPassword from "./Modals/ModalPassword"
import ModalAbout from "./Modals/ModalAbout"
import ModalAddToQueue from "./Modals/ModalAddToQueue"
import ModalAdminSettings from "./Modals/Admin/ModalAdminSettings"
import ModalUserGameState from "./Modals/ModalUserGameState"
import ScreenEffectsProvider from "./ScreenEffectsProvider"
import { ModifierBlurLayer } from "./ModifierBlurLayer"
import DrawerSchedule from "./Drawers/DrawerSchedule"
import PollHistoryModal from "./Poll/PollHistoryModal"
import QuickAccessPanels from "./QuickAccessPanels"

/**
 * Memoized so room-level re-renders (nowPlaying, listeners, etc.) do not tear down
 * overlay trees. Sidebar is already memoized for the same reason — schedule notes
 * FloatingPanels rely on that stability.
 */
function Overlays() {
  return (
    <div>
      <DrawerBookmarks />
      <DrawerPlaylist />
      <Box hideFrom="sm">
        <DrawerListeners />
        <DrawerSchedule />
      </Box>

      <ModalAbout />
      <ModalAddToQueue />
      <ModalAdminSettings />
      <ModalEditUsername />
      <ModalPassword />
      <ModalUserGameState />
      <PollHistoryModal />
      <QuickAccessPanels />

      {/* Timed modifier stacks (e.g. interface blur) */}
      <ModifierBlurLayer />
      {/* Screen effects handler - applies CSS animations from plugin events */}
      <ScreenEffectsProvider />
    </div>
  )
}

export default memo(Overlays)
