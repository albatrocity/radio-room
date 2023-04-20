import React from "react"
import { Hide } from "@chakra-ui/react"

import DrawerBookmarks from "./Drawers/DrawerBookmarks"
import DrawerPlaylist from "./Drawers/DrawerPlaylist"
import DrawerListeners from "./Drawers/DrawerListeners"

import ModalEditUsername from "./Modals/ModalEditUsername"
import ModalPassword from "./Modals/ModalPassword"
import ModalAbout from "./Modals/ModalAbout"
import ModalAddToQueue from "./Modals/ModalAddToQueue"
import ModalEditArtwork from "./Modals/ModalEditArtwork"
import ModalAdminSettings from "./Modals/ModalAdminSettings"

function Overlays() {
  return (
    <div>
      <DrawerBookmarks />
      <DrawerPlaylist />
      <Hide above="sm">
        <DrawerListeners />
      </Hide>

      <ModalAbout />
      <ModalAddToQueue />
      <ModalAdminSettings />
      <ModalEditArtwork />
      <ModalEditUsername />
      <ModalPassword />
    </div>
  )
}

export default Overlays
