import { memo, lazy, Suspense } from "react"
import { Box } from "@chakra-ui/react"

import DrawerBookmarks from "./Drawers/DrawerBookmarks"
import DrawerPlaylist from "./Drawers/DrawerPlaylist"
import DrawerListeners from "./Drawers/DrawerListeners"

import ModalEditUsername from "./Modals/ModalEditUsername"
import ModalPassword from "./Modals/ModalPassword"
import ModalAbout from "./Modals/ModalAbout"
import ModalAddToQueue from "./Modals/ModalAddToQueue"
import ModalUserGameState from "./Modals/ModalUserGameState"
import ScreenEffectsProvider from "./ScreenEffectsProvider"
import { ModifierBlurLayer } from "./ModifierBlurLayer"
import DrawerSchedule from "./Drawers/DrawerSchedule"
import PollHistoryModal from "./Poll/PollHistoryModal"
import { useIsAdmin } from "../hooks/useActors"

const ModalAdminSettings = lazy(() => import("./Modals/Admin/ModalAdminSettings"))
const QuickAccessPanels = lazy(() => import("./QuickAccessPanels"))

/**
 * Memoized so room-level re-renders (nowPlaying, listeners, etc.) do not tear down
 * overlay trees. Sidebar is already memoized for the same reason — schedule notes
 * FloatingPanels rely on that stability.
 *
 * Admin settings and Quick Access panels are role-gated lazy chunks so non-admins
 * never download plugin-config form UI (ADR 0076).
 */
function Overlays() {
  const isAdmin = useIsAdmin()

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
      <ModalEditUsername />
      <ModalPassword />
      <ModalUserGameState />
      <PollHistoryModal />

      {isAdmin && (
        <Suspense fallback={null}>
          <ModalAdminSettings />
          <QuickAccessPanels />
        </Suspense>
      )}

      {/* Timed modifier stacks (e.g. interface blur) */}
      <ModifierBlurLayer />
      {/* Screen effects handler - applies CSS animations from plugin events */}
      <ScreenEffectsProvider />
    </div>
  )
}

export default memo(Overlays)
