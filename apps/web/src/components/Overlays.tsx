import React from "react"
import { Box } from "@chakra-ui/react"

import DrawerBookmarks from "./Drawers/DrawerBookmarks"
import DrawerPlaylist from "./Drawers/DrawerPlaylist"
import DrawerListeners from "./Drawers/DrawerListeners"

import ModalEditUsername from "./Modals/ModalEditUsername"
import ModalPassword from "./Modals/ModalPassword"
import ModalAbout from "./Modals/ModalAbout"
import ModalAddToQueue from "./Modals/ModalAddToQueue"
import ModalAdminSettings from "./Modals/Admin/ModalAdminSettings"
import ScreenEffectsProvider from "./ScreenEffectsProvider"

function Overlays() {
  return (
    <div>
      <DrawerBookmarks />
      <DrawerPlaylist />
      <Box hideFrom="sm">
        <DrawerListeners />
      </Box>

      <ModalAbout />
      <ModalAddToQueue />
      <ModalAdminSettings />
      <ModalEditUsername />
      <ModalPassword />

      {/* Screen effects handler - applies CSS animations from plugin events */}
      <ScreenEffectsProvider />
    </div>
  )
}

export default Overlays
